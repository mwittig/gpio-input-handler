#!/bin/bash

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi
NAME=gpio-input-handler
cp init-script.sh /etc/init.d/${NAME}
chmod +x /etc/init.d/${NAME}
chown root:root /etc/init.d/${NAME}
update-rc.d ${NAME} defaults
