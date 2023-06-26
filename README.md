This project includes a bunch of random scripts for serving this to a LAN and providing https from local host. 
The terminal + shell code is in term.odd.html, the callbacks the terminal uses are in bin.js, and odd.js is a 'user space' appliction for writing scripts in odd-term.

1. Include and trust the provided .cer file. It's fine, I promise.
A)
    2. Run python3 server.py
    3. Click-y the link-y (that it produces)
B)
    2. Find someone running server.py
    3. Click the link they give you


To get a CA and cert for yourself, run the following commands:

```
brew install mkcert
brew install nss # if you use Firefox
mkcert -install
```
