#!/bin/bash
# Nacht/morgen-watcher v3: herstelt de laatste fase — entitlement-resign + launch + verificatie
cd "C:/Users/Gebruiker/.zcode/workspace/default/homeclock"
STATUS="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/nacht-status.txt"
IPFILE="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/ipad-ip.txt"

for attempt in $(seq 1 200); do
  IP=$(cat "$IPFILE" 2>/dev/null)
  [ -z "$IP" ] && IP=192.168.137.149
  ssh-keygen -R $IP >/dev/null 2>&1
  if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 mobile@$IP 'true' 2>/dev/null; then
    echo "$(date +%H:%M) ONLINE: $IP — resign + launch" >> "$STATUS"
    ssh -o StrictHostKeyChecking=accept-new mobile@$IP 'bash -c "
      echo pep | sudo -S ldid -S/tmp/sileo-ents.plist /var/jb/Applications/HomeClock.app/HomeClock && echo resign-ok
      echo pep | sudo -S chown -R mobile:mobile /var/mobile/Containers/Data/Application 2>/dev/null
      CONT=\$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name \".com.apple.mobile_container_manager.metadata.plist\" 2>/dev/null | xargs grep -l \"nl.krimson.homeclock\" 2>/dev/null | head -1 | xargs dirname)
      echo pep | sudo -S -u mobile mkdir -p \"\$CONT/Library/Application Support/nl.krimson.homeclock/RCTAsyncLocalStorage_V1\"
      echo pep | sudo -S killall HomeClock 2>/dev/null
      sleep 1
      uiopen --bundleid nl.krimson.homeclock
      sleep 15
      echo PROCES: \$(ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l)
      CONT2=\$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name \".com.apple.mobile_container_manager.metadata.plist\" 2>/dev/null | xargs grep -l \"nl.krimson.homeclock\" 2>/dev/null | head -1 | xargs dirname)
      echo ASYNC: \$(ls \"\$CONT2/Library/AsyncStorage/\" 2>/dev/null | head -3)
    "' 2>&1 | grep -v "zsh/watch" >> "$STATUS"
    echo "$(date +%H:%M) KLAAR — zie boven" >> "$STATUS"
    exit 0
  fi
  sleep 20
done
echo "$(date +%H:%M) geen contact deze ronde — herstart" >> "$STATUS"
nohup bash "$0" >> /dev/null 2>&1 &
exit 0
