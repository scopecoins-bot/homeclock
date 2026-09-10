#!/bin/bash
# Nacht-watcher v2: idempotente installatie + sandbox-herstel
# Draait tot de app werkend geinstalleerd en gestart is.
cd "C:/Users/Gebruiker/.zcode/workspace/default/homeclock/artifacts/homeclock-ios-24"
STATUS="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/nacht-status.txt"

while true; do
  FOUND=""
  for ip in 192.168.137.149 192.168.137.50 192.168.137.171 192.168.137.239; do
    ssh-keygen -R $ip >/dev/null 2>&1
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 mobile@$ip 'true' 2>/dev/null; then
      FOUND=$ip; break
    fi
  done

  if [ -n "$FOUND" ]; then
    echo "$(date +%H:%M) ONLINE: $FOUND — volledige installatie" >> "$STATUS"
    scp -q -o StrictHostKeyChecking=accept-new nl.krimson.homeclock.deb mobile@$FOUND:/var/mobile/HomeClock.deb 2>/dev/null
    ssh -o StrictHostKeyChecking=accept-new mobile@$FOUND 'bash -c "
      # 1) dpkg-status herstellen (idempotent)
      dpkg -l 2>/dev/null | grep -qi krimson || sudo dpkg -i /var/mobile/HomeClock.deb 2>&1 | tail -1
      dpkg -i /var/mobile/HomeClock.deb 2>&1 | tail -1
      # 2) exec-rechten
      sudo chmod 755 /var/jb/Applications/HomeClock.app/HomeClock
      sudo find /var/jb/Applications/HomeClock.app/Frameworks -type f \( -name \"*.dylib\" -o ! -name \"*.*\" \) -exec chmod 755 {} \; 2>/dev/null
      # 3) container-mappen vooraf als mobiele gebruiker
      CONT=\$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name \".com.apple.mobile_container_manager.metadata.plist\" 2>/dev/null | xargs grep -l \"nl.krimson.homeclock\" 2>/dev/null | head -1 | xargs dirname)
      if [ -n \"\$CONT\" ]; then
        sudo -u mobile mkdir -p \"\$CONT/Library/Application Support/nl.krimson.homeclock/RCTAsyncLocalStorage_V1\"
        sudo chown -R mobile:mobile \"\$CONT\"
      fi
      # 4) registreren + starten
      uicache -p /var/jb/Applications/HomeClock.app 2>/dev/null
      uiopen --bundleid nl.krimson.homeclock
      sleep 15
      echo PROCES: \$(ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l)
      echo DEBUGLOG:
      CONT2=\$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name \".com.apple.mobile_container_manager.metadata.plist\" 2>/dev/null | xargs grep -l \"nl.krimson.homeclock\" 2>/dev/null | head -1 | xargs dirname)
      grep -aoE \"hc.debuglog.{0,400}\" \"\$CONT2/Library/AsyncStorage/RKStorage\" 2>/dev/null | head -2
    "' 2>&1 | grep -v "zsh/watch" >> "$STATUS"
    echo "$(date +%H:%M) installatie-ronde afgerond — herstart over 2 min" >> "$STATUS"
    # zelf-herstart: blijft de nacht door doorgaan
    sleep 120
    nohup bash "$0" >> /dev/null 2>&1 &
    exit 0
  fi
  sleep 30
done
