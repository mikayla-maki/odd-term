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
    if (program.session) { // if we have a session, we're logged in
      sys.context.user = program.session.username
    }
  })

  commands.register("register", async (argv, sys) => {
    if (argv[1] == null) {
      sys.println("ERROR: No username specified")
      return;
    }
    if (argv[1] == "-h" || argv[1] == "--help") {
      sys.println("Register a username with Fission")
      sys.println("Usage: register <username>")
      return;
    }

    const username = argv[1];
    const program = await get_odd_program(sys)
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
      }
    } else {
      sys.println("ERROR: Invalid username")
    }
  })
}
