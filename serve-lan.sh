#!/bin/zsh

CURRENT_IP=$(ifconfig en0 | python3 parse_ip.py)
echo "Current IP: $CURRENT_IP"

if [ -e "certs/$CURRENT_IP.key" ]
then
    echo "Not making cert"
else
    pushd certs
    echo "Making cert"
    mkcert $CURRENT_IP
    mv $CURRENT_IP-key.pem $CURRENT_IP.key
    echo "Done making cert"
    popd
fi

(trap 'kill 0' SIGINT; python3 server.py localhost 8082 & python3 server.py $CURRENT_IP 8081)
