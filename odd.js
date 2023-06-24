import * as odd from "./odd.esm.min.js";

export function odd_commands(commands) {
  let program = null;

  async function get_odd_program(sys, messages) {
    let logger = sys.println
    if (typeof messages == "undefined" || messages == null || messages == false) {
      logger = console.log
    }
    if (program == null) {
      logger("Starting ODD...")
      program = await odd.program({
        namespace: { creator: "Mikayla", name: "OddTerminal" },
        debug: true,
      }).catch(error => {
        logger("Error starting ODD: " + error)

      })
    }
    return program
  }


  commands.on_startup(async (sys) => {
    const program = await get_odd_program(sys, true)
    if (program && program.session) { // if we have a session, we're logged in
      sys.context.user = program.session.username
      overwrite_file_commands()
    }
  })

  commands.register("register-odd", async (argv, sys) => {
    const program = await get_odd_program(sys, true)
    if (!program) {
      sys.println("ERROR: Could not connect to ODD");
      return;
    }
    if (program.session) {
      sys.println("ERROR: Already logged in")
      return;
    }
    if (argv[1] == null) {
      sys.println("ERROR: No username specified")
      return;
    }
    if (argv[1] == "-h" || argv[1] == "--help") {
      sys.println("Register a username with Fission")
      sys.println("Usage: register <username>")
      return;
    }

    try {
      const username = argv[1];
      const valid = program.auth.isUsernameValid(username);
      const available = await program.auth.isUsernameAvailable(username);

      if (valid && available) {
        sys.println("Registering " + username + " ...")
        const { success } = await program.auth.register({ username })
        sys.println(success ? "Successfully registered!" : "Failed to register :(")
        if (success) {
          const did = await program.agentDID()
          sys.print("Your DID is: ")
          sys.println(did)
          sys.context.user = username;
          overwrite_file_commands()
        }
      } else {
        sys.println("ERROR: Invalid username")
      }
    } catch (error) {
      sys.println("ERROR: " + error)
    }
  })

  function file_path(sys, file_name) {
    let path_components = [...sys.context.cwd];
    path_components.push(file_name);
    return odd.path.file("public", ...path_components);
  }

  function overwrite_file_commands() {
    commands.register("touch", async (argv, sys) => {
      const program = await get_odd_program(sys)

      if (!program) {
        sys.println("ERROR: Could not connect to ODD")
        return;
      }
      if (!program.session) {
        sys.println("ERROR: No username registered")
        return;
      }
      if (argv[1] == null) {
        sys.println("ERROR: No filename specified")
        return;
      }
      if (argv[1] == "-h" || argv[1] == "--help") {
        sys.println("Make a file on WNFS")
        sys.println("Usage: touch <filename>")
        return;
      }
      const path = file_path(sys, argv[1])
      const content = new TextEncoder().encode("Hello from touch")

      try {
        await program.session.fs.write(path, content)
      } catch (error) {
        sys.println("ERROR: " + error)
      }

    })


    commands.register("ls", async (_argv, sys) => {
      const program = await get_odd_program(sys);
      if (!program) {
        sys.println("ERROR: Could not connect to ODD")
      }
      if (!program.session) {
        sys.println("ERROR: No username registered")
        return;
      }

      const path = odd.path.directory("public", ...sys.context.cwd)

      try {
        const result = await program.session.fs.ls(path);
        console.dir(result);
        for (const file of Object.keys(result)) {
          sys.println(file + " - " + result[file].cid)
        }
      } catch (error) {
        sys.println("ERROR: " + error)
      }
    })

    commands.register("cat", async (argv, sys) => {
      const program = await get_odd_program(sys);

      if (!program) {
        sys.println("ERROR: Could not connect to ODD")
      }
      if (!program.session) {
        sys.println("ERROR: No username registered")
        return;
      }
      if (!argv[1]) {
        sys.println("ERROR: No filename specified")
        return;
      }

      const path = file_path(sys, argv[1])

      try {
        const result = await program.session.fs.read(path);
        sys.println((new TextDecoder("utf-8")).decode(result))
      } catch (error) {
        sys.println("ERROR: " + error)
      }
    })
  }
}
