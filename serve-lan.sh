#!/bin/zsh

CURRENT_IP=$(ifconfig en0 | python3 parse_ip.py)
echo "Current IP: $CURRENT_IP"

if [ -e "certs/$CURRENT_IP.key" ]
then
    echo "Not making cert"
else
    echo "Making cert"
    pushd certs
    mkcert $CURRENT_IP
    mv $CURRENT_IP-key.pem $CURRENT_IP.key
    popd
fi

python3 server.py localhost 8082 &
python3 server.py $CURRENT_IP 8081
