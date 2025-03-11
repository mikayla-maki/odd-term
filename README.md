This project includes a bunch of random scripts for serving this to a LAN and providing https from local host.
The terminal + shell code is in term.odd.html, the callbacks the terminal uses are in bin.js, and odd.js is a 'user space' appliction for writing scripts in odd-term.

1. Include and trust the provided .cer file. It's fine, I promise.
A)
    2. Run python3 server.py
    3. Click the link (that it produces)
B)
    2. Find someone running server.py
    3. Click the link they give you


To get a CA and cert for yourself, run the following commands:

```
brew install mkcert
brew install nss # if you use Firefox
mkcert -install
```

Make sure to run `register-odd <username>` after you get it running to use the file system stuff!

TODO:
====

1. ✅ Tab completion
2. ✅ History persistence to file system
3. ✅ File upload
4. ✅ better styling and interactions
5. ✅ Pipes
6. ✅ Directory manipulation
7. ✅ Move command
8. Mv command .. and . and / aware (absolutize paths + trim trailing slashes)
9. Context aware tab completion (report type of cursor position)
10. Quote line continuation when hitting enter on quotes (+ expand buffer to handle multiple lines)
11. Refactor into something that everyone can use
