/*
So there are a couple of components:

1. The renderer, the thing that implements print() and println() (others?)
  - Already pretty close to being abstracted, just need to seperate the files and define an interface
2. The main terminal / shell, which has the parsing logic and exposes commands
  - Already mostly abstracted, but needs to have some thought about how to do the keyboard handling
3. The odd integrations, which hook into the shell and provide FS access.
  - File system API / move file system commands into main shell

Goals:
* Be able to split out the filesystem implementation so that I can switch it for storj and stuff later
* Be able to split out the renderer so that it can be embedded / implemented in other places
* Re-use the shell logic for the above two things
* Use something like typescript to make it all easier for others to work with
* Long term: make a system to integrate ucan commands with an include and an init() call
* Make this includeable from a library / CDN

*/

import {commands} from "./bin.js";
// terminal: Add line wrapping to 'program_print' and cursor
// shell: glob expansion
// Demo: Actually integrating odd

class History {
    constructor() {
        this.history = [];
        this.cursor = 0;
    }

    get length() {
        return this.history.length;
    }

    reset() {
        this.cursor = this.length;
    }

    push(program) {
        if (program.trim() == "") {
            return;
        }

        this.history.push(program);
    }

    canNavigate() {
        return this.cursor != this.length;
    }

    navigateBackwards() {
        this.cursor = saturating_sub(this.cursor, 1);
    }

    navigateForwards() {
        this.cursor = saturating_add(this.cursor, 1, this.length);
    }

    current() {
        if (this.cursor == this.length) {
            return [];
        } else {
            return this.history[this.cursor].split("");
        }
    }
}

const content = document.getElementById("content");
content.innerHTML = "";
const body = document.getElementById("body");

let buffer = [];
let cursor = 0
let prompt_element = document.createElement("span");
let buffer_element = document.createElement("span");
let cursor_container = null;
let cursor_spacer = null;
let cursor_element = null;

let program = null;

let history = new History();

function make_cursors() {
    cursor_container = document.createElement("span");
    cursor_spacer = document.createElement("span");
    cursor_element = document.createElement("span");
    cursor_container.classList.add("cursor-container");
    cursor_spacer.classList.add("cursor-spacer");
    cursor_element.classList.add("cursor");
    cursor_container.append(cursor_spacer, cursor_element);
    cursor_element.append("\xa0");
    cursor_container.style.userSelect = "none";
    cursor_container.style.position = "absolute";
    cursor_container.style.zIndex = 0;
    cursor_element.style.userSelect = "none";
    cursor_element.style.userSelect = "none";
    cursor_element.style.backgroundColor = "white";
    cursor_element.style.opacity = 0.5;
}

// https://stackoverflow.com/a/22480938
function isScrolledIntoView(el) {
    var rect = el.getBoundingClientRect();
    var elemTop = rect.top;
    var elemBottom = rect.bottom;

    // Only completely visible elements return true:
    var isVisible = (elemTop >= 0) && (elemBottom <= window.innerHeight);
    // Partially visible elements return true:
    //isVisible = elemTop < window.innerHeight && elemBottom >= 0;
    return isVisible;
}

function flush_edit_buffer() {
    buffer_element.innerHTML = process_text(buffer.join(""));

    let cursor_spaces = "";
    for (var i = 0; i < cursor; i++) {
        cursor_spaces += "\xa0";
    }

    // // I don't know why this is needed
    // if (cursor == 0 && buffer.length == 0) {
    //     cursor_spaces = "\xa0";
    // }

    cursor_spacer.innerHTML = cursor_spaces

    if (!isScrolledIntoView(buffer_element)) {
        window.scrollTo(0, document.body.scrollHeight);
    }
}

function process_text(text) {
    return text.replace(" ", "\xa0")
        .replace("<", "\x3c")
        .replace(">", "\x3e")
        .replace("\n", "<br/>");
}

function write_edit_buffer(text) {
    let length = text.length;
    let text_array = text.split("")
    for (var i = 0; i < text_array.length; i++) {
        buffer.splice(cursor + i, 0, text_array[i]);
    }
    cursor += length;
    flush_edit_buffer();
}

function backspace() {
    if (cursor > 0) {
        cursor -= 1;
        buffer.splice(cursor, 1);
    }
    flush_edit_buffer();
}

function backspace_word() {
    let idx = get_last_edit_buffer_word_idx()
    let delete_length = cursor - idx;
    if (delete_length > 0) {
        cursor = idx;
        buffer.splice(cursor, delete_length);
    }
    flush_edit_buffer();
}


const context = {
    cwd: [],
    user: null
};

function prompt_text() {
    let result = ""
    if (context.user) {
        result += "<span style='color:#b7b7fd'>@" + context.user + "</span>:";
    }
    result += "~";
    if (context.cwd.length > 0) {
        result += "/";
    }
    return result + context.cwd.join("/") + " <span style='color:pink'>></span> ";
}

let line_output = true;

function prompt() {
    prompt_element.innerHTML = prompt_text()
    window.scrollTo(0, document.body.scrollHeight);
}

function make_sys(env_vars) {
    return {
        display: print,
        displayln: println,
        env: env_vars,
        print,
        println,
        context,
        read: () => {
            return null
        },
    }
}

function arg_split(argv_string) {
    let argv = []
    let literal_char = null;
    let arg = "";
    for (let i = 0; i < argv_string.length; i++) {
        let char = argv_string[i];

        if (!literal_char && char == " ") {
            if (arg != "") {
                argv.push(arg);
            }
            arg = ""
            continue;
        }
        if (!literal_char && (char == "\"" || char == "\'")) {
            literal_char = char
            continue;
        }
        if (literal_char && char == literal_char) {
            literal_char = null
            continue;
        }

        arg += char;
    }
    if (arg.trim() != "") {
        argv.push(arg.trim());
    }

    return argv
}

function consume_to_seperators(idx, program_buffer, seperators) {
    let result = "";
    let i = idx;
    for (let j = i + 1; j < program_buffer.length; j++) {
        let break_outer = false;
        for (let k = 0; k < seperators.length; k++) {
            if (program_buffer[j] == seperators[k]) {
                break_outer = true;
                break;
            }
        }
        if (break_outer) {
            break;
        }

        result += program_buffer[j]
        i = j;
    }
    return [result, i];
}

function consume_env_vars(program_buffer) {
    let env_vars = {};
    for (let i = 0; i < program_buffer.length; i++) {
        // Consume starting white space
        if (program_buffer[i] == " ") {
            continue;
        } else if (program_buffer[i] == "$") {
            let result = consume_to_seperators(i, program_buffer, [" "])
            let env_var = result[0]
            i = result[1]
            let env_var_parts = env_var.split("=")
            if (env_var_parts.length < 1) {
                throw Error("Invalid env var")
            }
            env_vars[env_var_parts[0]] = env_var_parts[1] ? env_var_parts[1] : ""
        } else {
            return [i, env_vars];
        }
    }
    return [program_buffer.length, env_vars];
}

function parse_programs(program_buffer) {
    let cur_text = ""
    let programs = [];
    let cur_program = null;

    let result = consume_env_vars(program_buffer);
    let start = result[0];
    let env_vars = result[1];

    for (let i = start; i < program_buffer.length; i++) {
        let char = program_buffer[i];

        if (char == ">") {
            let program = null;
            if (!cur_program) {
                program = {
                    argv: arg_split(cur_text),
                    stdout: "",
                    stdin: null,
                    pipe: null,
                };
            } else {
                if (cur_text.trim() != "") {
                    throw Error("This should be impossible?");
                }
                program = cur_program;
            }
            let result = consume_to_seperators(i + 1, program_buffer, [" "]);
            i = result[1];
            let file_name = result[0];
            program.stdout = file_name.trim();
            programs.push(program);
            cur_program = null;
            cur_text = "";
            continue;
        } else if (char == "<") {
            let program = null;
            if (!cur_program) {
                program = {
                    argv: null,
                    stdout: null,
                    stdin: cur_text.trim(),
                    pipe: null,
                }
            } else {
                if (cur_text.trim() != "") {
                    throw Error("This should be impossible?");
                }
                program = cur_program
            }

            let result = consume_to_seperators(i, program_buffer, [">", "<", "|"]);
            i = result[1];
            let argv = result[0];
            program.argv = arg_split(argv)
            cur_text = "";
            cur_program = program;
            continue;
        } else if (char == "|") {
            if (!cur_program) {
                programs.push({
                    argv: arg_split(cur_text),
                    stdout: null,
                    stdin: null,
                    pipe: true,
                })
            } else {
                if (cur_text.trim() != "") {
                    cur_program.argv = arg_split(cur_text);
                }
                cur_program.pipe = true;
                programs.push(cur_program);
            }
            cur_text = "";
            cur_program = null;
            continue;
        }

        cur_text += char;
    }

    if (cur_text != "") {
        if (!cur_program) {
            programs.push({
                argv: arg_split(cur_text),
                stdout: null,
                stdin: null
            })
        } else {
            cur_program.argv = arg_split(cur_text);
            programs.push(cur_program)
        }
    } else if (cur_program != null) {
        programs.push(cur_program);
    }


    return [env_vars, programs];
}

function parse_program_test() {
    let program = "$DEBUG=test test.txt < echo 'hello world' | echo | number-lines -l > test.txt";
    let result = parse_programs(program.split(""))
    if (JSON.stringify(result) !== JSON.stringify([
        {DEBUG: "test"},
        [
            {
                argv: ["echo", "hello world"],
                stdout: null,
                stdin: "test.txt",
                pipe: true
            },
            {
                argv: ["echo"],
                stdout: null,
                stdin: null,
                pipe: true
            },
            {
                argv: ["number-lines", "-l"],
                stdout: "test.txt",
                stdin: null,
                pipe: null
            },
        ]
    ])) {
        debugger;
        alert("Failed to parse program")
        console.dir(result)
        throw new Error("Failed to parse program");
    }
}
parse_program_test()

function pipe_read_sys(sys, pipe) {
    let read_pipe = [...pipe]
    return {
        ...sys,
        read: function () {
            if (read_pipe.length == 0) {
                return sys.read();
            }
            return read_pipe.shift();
        }
    }
}

function pipe_write_sys(sys, pipe) {
    return {
        ...sys,
        print: function (item) {
            pipe.push(item);
        },
        println: function (item) {
            pipe.push(item);
            pipe.push("\n")
        }
    }
}

let command_running = false;

async function enter(commands) {
    command_running = true;
    let command = [...buffer];
    buffer = [];
    cursor = 0;
    cursor_container.innerHTML = "";
    content.append(document.createElement("br"));
    let command_str = command.join("");

    let result = parse_programs(command)
    console.dir(result);
    let env_vars = result[0];
    let programs = result[1];

    let sys = make_sys(env_vars);
    let pipe = [];
    let had_pipe = false;
    for (const program of programs) {
        if (had_pipe && program.stdin) {
            console.dir(command_str, result);
            throw new Error("Program parse erorr: had pipe + stdin are mutuallly exclusive")
        }
        if (program.stdout && program.pipe) {
            console.dir(command_str, result)
            throw new Error("Program parse erorr: pipe and stdout are mutually exclusive");
        }

        let pipe_sys = sys;
        if (had_pipe) {
            // Wraps read() with the pipe buffer
            pipe_sys = pipe_read_sys(pipe_sys, pipe);
            pipe = [];
            had_pipe = false;
        }
        if (program.pipe) {
            // Wraps print() and println() in a buffer
            pipe_sys = pipe_write_sys(pipe_sys, pipe)
            had_pipe = true;
        }
        await commands.invoke(program, pipe_sys);
    }
    if (!line_output) {
        let span = document.createElement("span")
        span.style.backgroundColor = "white"
        span.style.opacity = 0.5
        span.style.color = "black"
        span.append("%");
        content.append(span);
        content.append(document.createElement("br"));
        line_output = true;
    }
    // This goes after command invocation so that it's unlikely for
    // commands to race history maintenance completion.
    Promise.all(commands.on_history_handlers.map((cb) => cb(sys, history, command_str)))
    history.push(command_str);
    history.reset();

    make_cursors();
    prompt_element = document.createElement("span");
    buffer_element = document.createElement("span");
    prompt();
    flush_edit_buffer();
    content.append(prompt_element, cursor_container, buffer_element);
    command_running = false;
}

function saturating_sub(a, b) {
    let result = a - b;
    if (result < 0) {
        return 0;
    } else {
        return result;
    }
}

function wrapping_sub(a, b, wrap) {
    let result = a - b;
    if (result < 0) {
        return wrap;
    } else {
        return result;
    }
}

function saturating_add(a, b, limit) {
    let result = a + b;
    if (result > limit) {
        return limit;
    } else {
        return result;
    }
}

function navigateHistory(history, cb) {
    if (history.canNavigate() || buffer.join("").trim().length == 0) {
        cb(history);

        buffer = history.current();
        cursor = buffer.length;

        flush_edit_buffer();
    }
}

content.addEventListener("paste", async (event) => {
    let text = event.clipboardData.getData('text/plain');
    write_edit_buffer(text);
})

function cursor_end() {
    return buffer.length
}

function get_last_edit_buffer_word_idx() {
    for (let i = cursor - 1; i > 0; i--) {
        if (buffer[i] == " "
            || buffer[i] == ":"
            || buffer[i] == "/"
            || buffer[i] == "!"
            || buffer[i] == "$"
            || buffer[i] == ">"
            || buffer[i] == "<"
            || buffer[i] == "|"
            || buffer[i] == "&"
            || buffer[i] == ";"
            || buffer[i] == "\n"
            || buffer[i] == "\t") {
            return i;
        }
    }
    return 0;
}
function get_next_edit_buffer_word_idx() {
    for (let i = cursor + 1; i < buffer.length; i++) {
        if (buffer[i] == " "
            || buffer[i] == ":"
            || buffer[i] == "/"
            || buffer[i] == "!"
            || buffer[i] == "$"
            || buffer[i] == ">"
            || buffer[i] == "<"
            || buffer[i] == "|"
            || buffer[i] == "&"
            || buffer[i] == ";"
            || buffer[i] == "\n"
            || buffer[i] == "\t") {
            return i;
        }
    }
    return cursor_end();
}

function clear_terminal() {
    content.innerHTML = "";
    make_cursors();
    prompt_element = document.createElement("span");
    buffer_element = document.createElement("span");
    prompt();
    flush_edit_buffer();
    content.append(prompt_element, cursor_container, buffer_element);
}

function find_longest_matching_symbol_substring() {
    let candidates = [];
    let buffer_full_txt = buffer.join("")
    if (buffer_full_txt.trim() == "" || cursor != buffer_full_txt.length) {
        return false;
    }
    let buffer_txt = buffer.slice(get_last_edit_buffer_word_idx()).join("").trim()
    for (const symbol of commands.all_symbols()) {
        if (symbol.text.startsWith(buffer_txt)) {
            candidates.push(symbol);
        }
    }
    // Find the longest common prefix of all candidates
    if (candidates.length == 0) {
        return;
    }
    console.dir(candidates);
    let longest = candidates[0].text;
    for (const candidate of candidates) {
        let i = 0;
        while (i < longest.length && i < candidate.text.length && longest[i] == candidate.text[i]) {
            i++;
        }
        longest = longest.slice(0, i);
    }
    let perfect_match = candidates.map(candidate => candidate.text).indexOf(longest);
    if (buffer_txt == longest) {
        show_suggestions(candidates)
        return;
    } else {
        write_edit_buffer(longest.slice(buffer_txt.length) + (perfect_match >= 0 ? candidates[perfect_match].completion : ""));
    }
}

let suggestions = null;
function show_suggestions(candidates) {
    candidates.sort()
    candidates = candidates.slice(0, 10);
    if (suggestions) {
        suggestions.remove();
    }
    suggestions = document.createElement("div");
    candidates.forEach((candidate) => {
        let suggestion = document.createElement("span");
        suggestion.style.backgroundColor = "white"
        suggestion.style.opacity = 0.5
        suggestion.style.color = "black"
        suggestion.append(candidate.text);
        suggestions.append(suggestion);
        suggestions.append(document.createElement("br"));
    });
    buffer_element.parentElement.append(suggestions);
}

body.addEventListener("keydown", async (event) => {
    console.log(event.code);
    if (command_running) {
        event.preventDefault();
        return;
    }

    if (event.code == "ArrowUp") {
        event.preventDefault();
        return navigateHistory(history, (history) => history.navigateBackwards());
    } else if (event.code == "ArrowDown") {
        event.preventDefault();
        return navigateHistory(history, (history) => history.navigateForwards());
    } else {
        history.reset();
    }

    if (event.code == "Tab") {
        event.preventDefault();
        find_longest_matching_symbol_substring();
        return;
    } else if (suggestions) {
        suggestions.remove();
        suggestions = null;
    }

    switch (event.code) {
        case "KeyA": {
            if (event.ctrlKey || event.metaKey) {
                cursor = 0
                flush_edit_buffer();
            } else {
                write_edit_buffer(event.key)
            }
            break;
        }
        case "Slash":
            event.preventDefault();
            write_edit_buffer(event.key)
            break;
        case "KeyV": {
            if (event.ctrlKey || event.metaKey) {
                return
            } else {
                write_edit_buffer(event.key)
            }
            break;
        }
        case "KeyK": {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                clear_terminal();
            } else {
                write_edit_buffer(event.key)
            }
            break;
        }
        case "Enter":
            event.preventDefault();
            await enter(commands);
            break;
        case "Backspace":
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                cursor = 0;
                buffer = [];
                flush_edit_buffer();
            } else if (event.getModifierState("Alt")) {
                backspace_word()
            } else {
                backspace();
            }
            break;
        case "ArrowLeft":
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
                cursor = 0
            } else if (event.getModifierState("Alt")) {
                cursor = get_last_edit_buffer_word_idx();
            } else {
                cursor = saturating_sub(cursor, 1);
            }
            flush_edit_buffer();
            break;
        case "ArrowRight":
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
                cursor = cursor_end()
            } else if (event.getModifierState("Alt")) {
                cursor = get_next_edit_buffer_word_idx();
            } else {
                cursor = saturating_add(cursor, 1, buffer.length);
            }

            flush_edit_buffer();
            break;
        case "Quote":
            event.preventDefault()
            if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                write_edit_buffer(event.key)
            }
            break;
        case "Tab":
        case "OSLeft":
        case "AltLeft":
        case "ShiftLeft":
        case "ControlLeft":
        case "OSRight":
        case "AltRight":
        case "ShiftRight":
        case "ControlRight":
        case "Escape":
            event.preventDefault();
            break;
        default:
            if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                write_edit_buffer(event.key)
            }
    }
})

function print(text) {
    line_output = false;
    if (typeof text == "string") {
        content.append(process_text(text));
    } else if (text instanceof File) {
        content.append(text.name + " (" + text.type + ", " + text.size + " bytes)");
    } else if (typeof text == "object" && !(text instanceof HTMLElement)) {
        content.append(process_text(JSON.stringify(text, null, 2)));
    } else {
        content.append(text);
    }
    window.scrollTo(0, document.body.scrollHeight);
}
function println(text) {
    if (text) {
        print(text);
    }
    line_output = true;
    let br = document.createElement("br");
    content.append(br);
}

await Promise.all(commands.on_startup_programs.map((program) => program(make_sys(null))))
// Initial sync
await Promise.all(commands.on_history_handlers.map((cb) => cb(make_sys(null), history, null)))


make_cursors()
buffer_element.style.zIndex = 1;
content.append(prompt_element, cursor_container, buffer_element);
prompt();
flush_edit_buffer();

/*
 1. ✅ Tab completion
 2. ✅ History persistence to file system
 3. ✅ File upload
 4. ✅ better styling and interactions
 5. ✅ Pipes
 6. ✅ Directory manipulation
 7. ✅ Move command
 8. Refactor into something that everyone can use
 9. Mv command .. and . and / aware (absolutize paths + trim trailing slashes)
 10. Context aware tab completion (report type of cursor position)
 11. Quote line continuation when hitting enter on quotes (+ expand buffer to handle multiple lines)
 */
