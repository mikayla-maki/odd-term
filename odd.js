import * as odd from "./odd.esm.min.js";

// TODO: Deduplicate this with the one in the main file.
function saturating_sub(a, b) {
  let result = a - b;
  if (result < 0) {
    return 0;
  } else {
    return result;
  }
}

export function odd_commands(commands) {
  let odd_program = null;
  async function get_odd_program(sys, messages) {
    let logger = sys.println
    if (typeof messages == "undefined" || messages == null || messages == false) {
      logger = console.log
    }
    if (odd_program == null) {
      logger("Starting ODD...")
      odd_program = await odd.program({
        namespace: { creator: "Mikayla", name: "OddTerminal" },
        debug: true,
      }).catch(error => {
        logger("Error starting ODD: " + error)
      })
    }
    return odd_program
  }

  let history_index = null;
  const history_path = odd.path.file("public", ".history");

  commands.on_history(async (sys, history, command_str) => {
    const program = await get_odd_program(sys, true)
    if (program && program.session) { // if we have a session, we're logged in
      let history_text = "";
      // TODO: split the history files up so that they don't grow too unbounded
      if (await program.session.fs.exists(history_path)) {
        let history_file = await program.session.fs.read(history_path);
        history_text = (new TextDecoder("utf-8")).decode(history_file);
        // Truncate to 100 entries, to keep things nice.
        let history_entries = history_text.split("\n");
        history_entries = history_entries.filter(entry => entry != "")
        let starting_point = saturating_sub(history_entries.length, 100);
        history_entries = history_entries.slice(starting_point);
        if (!history_index) {
          history.history.unshift(...history_entries.slice(starting_point, history_entries.length));
          let length = history_entries.length - starting_point;
          history.cursor += length - 1;
          history_index = history_entries.length;
        }
        history_text = history_entries.join("\n");
      } else {
        for (let i = 0; i < history.history.length; i++) {
          history_text += history.history[i] + "\n";
        }
        history_index = history.history.length;
      }
      if (command_str) {
        history_text += "\n" + command_str;
        // TODO: Better synchronize and use the history index for !
        history_index += 1;
      }
      await program.session.fs.write(history_path, (new TextEncoder()).encode(history_text))
      await program.session.fs.publish()
    }
  })

  commands.on_startup(async (sys) => {
    const program = await get_odd_program(sys, true)
    if (program && program.session) { // if we have a session, we're logged in
      sys.context.user = program.session.username
      add_odd_fs_commands(program, history)
      program.on("fileSystem:local-change", async (_obj) => {
        const path = odd.path.directory("public", ...sys.context.cwd)
        const result = await program.session.fs.ls(path);
        let completions = Object.values(result).map(file => {
          return { text: file.name, completion: (file.isFile ? " " : "/") }
        });
        commands.set_extra_symbols(completions)
      });

    }
  })

  commands.register_command("register-odd", async (argv, sys) => {
    const program = await get_odd_program(sys, true)
    if (!program) {
      throw Error("Could not connect to ODD")
    }
    if (program.session) {
      throw Error("Already logged in")
    }
    if (argv[1] == null) {
      throw Error("No username specified")
    }
    if (argv[1] == "-h" || argv[1] == "--help") {
      sys.println("Register a username with Fission")
      sys.println("Usage: register <username>")
      return;
    }

    const username = argv[1];
    const valid = program.auth.isUsernameValid(username);
    const available = await program.auth.isUsernameAvailable(username);

    if (!valid || !available) {
      throw Error("Invalid username")
    }
    sys.println("Registering " + username + "...")
    const { success } = await program.auth.register({ username })
    sys.println(success ? "Successfully registered!" : "Failed to register :(")
    if (success) {
      const did = await program.agentDID()
      sys.print("Your DID is: ")
      sys.println(did)
      sys.context.user = username;
      // TODO: This program doesn't have the session set for some reason
      add_odd_fs_commands(program)
    }
  })

  function make_path(cwd_array, file_name, directory = false) {
    let path_components = [...cwd_array];
    path_components.push(file_name);
    if (directory) {
      return odd.path.directory("public", ...path_components);
    } else {
      return odd.path.file("public", ...path_components);
    }
  }

  function add_odd_fs_commands(program) {
    async function make_sys(stdout_file, stdin_file, sys) {
      let odd_sys = { sys }
      odd_sys.flush = async () => {
        await program.session.fs.publish()
      };

      if (stdin_file) {
        let stdin_path = make_path(sys.context.cwd, stdin_file);
        let stdin_result = await program.session.fs.read(stdin_path);
        let read_buffer = (new TextDecoder("utf-8")).decode(stdin_result)
        let read_buffer_read = false;
        odd_sys.sys.read = () => {
          if (!read_buffer_read) {
            read_buffer_read = true;
            return read_buffer;
          } else {
            return null;
          }
        }
      }
      if (stdout_file) {
        let path = path(sys, stdout_file);
        let write_buffer = ""
        odd_sys.sys.print = (text) => {
          write_buffer += text;
        }
        odd_sys.sys.println = (text) => {
          write_buffer += text + "\n";
        }
        odd_sys.flush = async () => {
          const content = new TextEncoder().encode(write_buffer)
          await program.session.fs.write(path, content)
          await program.session.fs.publish()
        }
      }
      return odd_sys
    }

    commands.set_middleware(async (program, command, sys) => {
      let odd_sys = await make_sys(program.stdout, program.stdin, sys)
      await command(odd_sys.sys)
      await odd_sys.flush()
    })

    commands.register_command("touch", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      if (argv[1] == null) {
        throw Error("No filename specified")
      }
      if (argv[1] == "-h" || argv[1] == "--help") {
        sys.println("Make a file on WNFS")
        sys.println("Usage: touch <filename>")
        return;
      }
      const path = make_path(sys.context.cwd, argv[1])
      const content = new TextEncoder().encode("")

      await program.session.fs.write(path, content)
    })

    commands.register_command("ls", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      let filter_hidden = true;
      if (argv[1] == "-a") {
        filter_hidden = false;
      }

      const path = odd.path.directory("public", ...sys.context.cwd)

      const result = await program.session.fs.ls(path);
      let files = Object.values(result);
      if (filter_hidden) {
        files = files.filter((file) => !file.name.startsWith("."))
      }
      files.sort((a, b) => a.isFile == b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1)
      for (const file of files) {
        sys.println(file.name + (file.isFile ? "" : "/") + " - " + file.cid)
      }
    })

    commands.register_command("cat", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      let download = false;
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] == "-h" || argv[i] == "--help") {
          sys.println("Print the contents of a file")
          sys.println("Usage: cat <filename>")
          sys.println("Option: -d (WIP) make a download link instead of printing the contents")
          sys.println("Option: -h print this help message")
          return;
        }
        if (argv[i] == "-d") {
          argv.splice(i, 1)
          i--;
          download = true;
        }
      }

      if (!argv[1]) {
        let img = document.createElement("img");
        img.src = "data:image/jpeg;base64,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"
        sys.println(img)
        return;
      }

      const path = make_path(sys.context.cwd, argv[1])

      const result = await program.session.fs.read(path);
      if (download) {
        let link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(new Blob([result], { type: "application/octet-stream" })));
        link.setAttribute("download", argv[1]);
        link.appendChild(document.createTextNode("Download " + argv[1]));
        sys.println(link);
        return;
      }
      if (argv[1].endsWith(".jpg") || argv[1].endsWith(".jpeg")) {
        let img = document.createElement("img");
        img.src = URL.createObjectURL(new Blob([result], { type: "image/jpeg" }));
        sys.println(img)
        if (img.complete) {
          // URL.revokeObjectURL(img.src);
        } else {
          img.onload = () => {
            // URL.revokeObjectURL(img.src);
          }
        }
      } else {
        sys.println((new TextDecoder("utf-8")).decode(result))
      }
    })

    commands.register_command("rm", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      if (!argv[1]) {
        throw Error("No filename specified")
      }

      const path = make_path(sys.context.cwd, argv[1])
      await program.session.fs.rm(path);
    })

    commands.register_command("cd", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      if (!argv[1]) {
        throw Error("No directory specified")
      }

      let tmp_cwd = [...sys.context.cwd];
      let path_components = argv[1].split("/");
      for (let path_component of path_components) {
        if (path_component == "." || path_component == "") { continue; }
        if (path_component == "..") {
          if (typeof tmp_cwd.pop() == "undefined") {
            throw Error("Cannot go up from root")
          }
        } else {
          if (await program.session.fs.exists(make_path(tmp_cwd, path_component, true))) {
            tmp_cwd.push(path_component);
          } else {
            throw Error("No such directory")
          }
        }
      }
      sys.context.cwd = tmp_cwd;
    })

    commands.register_command("mkdir", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      if (!argv[1]) {
        throw Error("No directory name specified")
      }


      const path = make_path(sys.context.cwd, argv[1], true)
      await program.session.fs.mkdir(path);
    })

    commands.register_command("write-file", async (argv, sys) => {
      if (!program.session) {
        throw Error("No username registered")
      }
      let file = sys.read();
      if (!file || !(file instanceof File)) {
        throw Error("No file in stdin")
      }

      let file_name = file.name;
      if (argv[1] == "--name") {
        file_name = argv[2];
      }

      const path = path(sys, file_name);
      await program.session.fs.write(path, file);
    })
  }
}
