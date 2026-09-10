#!/bin/bash
# Nacht-watcher: installeert HomeClock op de iPad zodra bereikbaar,
# leest de debuglog en schrijft de status naar nacht-status.txt
cd "C:/Users/Gebruiker/.zcode/workspace/default/homeclock/artifacts/homeclock-ios-26"
STATUS="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/nacht-status.txt"
for attempt in $(seq 1 18); do
  FOUND=""
  for ip in 192.168.137.149 192.168.137.50 192.168.137.171 192.168.137.239; do
    ssh-keygen -R $ip >/dev/null 2>&1
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 mobile@$ip 'true' 2>/dev/null; then
      FOUND=$ip; break
    fi
  done
  if [ -n "$FOUND" ]; then
    echo "$(date +%H:%M) ONLINE: $FOUND" >> "$STATUS"
    scp -q -o StrictHostKeyChecking=accept-new nl.krimson.homeclock.deb mobile@$FOUND:/var/mobile/HomeClock.deb 2>/dev/null
    ssh -o StrictHostKeyChecking=accept-new mobile@$FOUND 'bash -c "
      sudo dpkg -i /var/mobile/HomeClock.deb 2>&1 | tail -1
      sudo chmod 755 /var/jb/Applications/HomeClock.app/HomeClock
      sudo find /var/jb/Applications/HomeClock.app/Frameworks -type f \( -name \"*.dylib\" -o ! -name \"*.*\" \) -exec chmod 755 {} \; 2>/dev/null
      CONT=\$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name \".com.apple.mobile_container_manager.metadata.plist\" 2>/dev/null | xargs grep -l \"nl.krimson.homeclock\" 2>/dev/null | head -1 | xargs dirname)
      sudo -u mobile mkdir -p \"\$CONT/Library/Application Support/nl.krimson.homeclock\" 2>/dev/null
      uicache -p /var/jb/Applications/HomeClock.app 2>/dev/null
      uiopen --bundleid nl.krimson.homeclock
      sleep 20
      ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l
      echo === debuglog ===
      grep -aoE \"hc.debuglog.{0,500}\" \"\$CONT/Library/AsyncStorage/RKStorage\" 2>/dev/null | head -2
      echo === containers ===
      ls /var/mobile/Containers/Data/Application | wc -l
    "' 2>&1 | grep -v "zsh/watch" >> "$STATUS"
    echo "$(date +%H:%M) KLAAR" >> "$STATUS"
    exit 0
  fi
  sleep 30
done
echo "$(date +%H:%M) geen contact deze ronde — self-restart" >> "$STATUS"
# zelfstandig herstarten (nachtmodus); stopt pas na geslaagde installatie
nohup bash "$0" >> /dev/null 2>&1 &
