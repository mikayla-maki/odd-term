export let readToEnd = (sys) => {
    let input = "";
    let read = sys.read();
    while (read != null) {
        input += read;
        read = sys.read();
    }
    return input;
}
