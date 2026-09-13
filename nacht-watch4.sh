#!/bin/bash
# Nacht-watcher v4: de beslissende experimenten-reeks.
cd "C:/Users/Gebruiker/.zcode/workspace/default/homeclock"
STATUS="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/nacht-status.txt"
ART="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/artifacts/homeclock-ios-26"
IPAD="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/ipad-ip.txt"

while true; do
  FOUND=""
  for ip in 192.168.137.149 192.168.137.50 192.168.137.171 192.168.137.239; do
    ssh-keygen -R $ip >/dev/null 2>&1
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 mobile@$ip 'true' 2>/dev/null; then
      FOUND=$ip; break
    fi
  done
  if [ -n "$FOUND" ]; then
    echo "$FOUND" > "$IPAD"
    echo "$(date +%H:%M) ONLINE: $FOUND — experimenten" >> "$STATUS"
    # Pakketten vooraf uploaden
    cd apps/ipad
    tar czf /tmp/local-assets.tgz local-assets 2>/dev/null
    cd ../..
    scp -q -o StrictHostKeyChecking=accept-new "$ART/nl.krimson.homeclock.deb" mobile@$FOUND:/var/mobile/HomeClock.deb 2>/dev/null
    scp -q -o StrictHostKeyChecking=accept-new apps/ipad/local-app2.hbc no-container.plist /tmp/local-assets.tgz mobile@$FOUND:/var/mobile/ 2>/dev/null

    ssh -o StrictHostKeyChecking=accept-new mobile@$FOUND 'bash -s' >> "$STATUS" 2>&1 <<'REMOTE'
PW=pep
S() { echo "$PW" | sudo -S sh -c "$1" 2>/dev/null; }
M() { echo "$PW" | sudo -S -u mobile sh -c "$1" 2>/dev/null; }
APP=/var/jb/Applications/HomeClock.app

echo "===== STAP 1: schone basis ====="
S "dpkg -i /var/mobile/HomeClock.deb" 2>&1 | tail -1
S "chmod 755 $APP/HomeClock"
S "find $APP/Frameworks -type f \( -name '*.dylib' -o ! -name '*.*' \) -exec chmod 755 {} \; 2>/dev/null"

echo "===== STAP 2: container + dirs vooraf ====="
CONT=$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name ".com.apple.mobile_container_manager.metadata.plist" 2>/dev/null | xargs grep -l "nl.krimson.homeclock" 2>/dev/null | head -1 | xargs dirname)
echo "container: $CONT"
if [ -n "$CONT" ]; then
  S "chown -R mobile:mobile '$CONT'"
  M "mkdir -p '$CONT/Library/Application Support/nl.krimson.homeclock/RCTAsyncLocalStorage_V1'"
  M "touch '$CONT/Library/Application Support/nl.krimson.homeclock/RCTAsyncLocalStorage_V1/.wtest'" && echo "posix-write: OK" && M "rm -f '$CONT/Library/Application Support/nl.krimson.homeclock/RCTAsyncLocalStorage_V1/.wtest'"
fi

echo "===== STAP 3: CI-bundle + lancering + storage-check ====="
S "killall HomeClock" 2>/dev/null
sleep 1
uicache -p $APP 2>/dev/null
uiopen --bundleid nl.krimson.homeclock
sleep 18
echo "proces: $(ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l)"
CONT=$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name ".com.apple.mobile_container_manager.metadata.plist" 2>/dev/null | xargs grep -l "nl.krimson.homeclock" 2>/dev/null | head -1 | xargs dirname)
ls "$CONT/Library/AsyncStorage/" 2>/dev/null | head -3
ls "$CONT/Library/AsyncStorage/" >/dev/null 2>&1 && echo "RKStorage: AANGEMAAKT (storage werkt!)" || echo "RKStorage: NIET AANGEMAAKT"
ls -t /var/mobile/Library/Logs/CrashReporter/HomeClock*.ips 2>/dev/null | head -1

echo "===== STAP 4: debug-bundel (lokaal gebouwd + assets) ====="
S "cp $APP/main.jsbundle $APP/main.jsbundle.ci"
S "cp /var/mobile/local-app2.hbc $APP/main.jsbundle"
S "cd /var/mobile && tar xzf local-assets.tgz -C /var/jb/Applications/HomeClock.app/ 2>/dev/null"
S "killall HomeClock" 2>/dev/null
sleep 1
uiopen --bundleid nl.krimson.homeclock
sleep 15
echo "proces: $(ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l)"
CONT=$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name ".com.apple.mobile_container_manager.metadata.plist" 2>/dev/null | xargs grep -l "nl.krimson.homeclock" 2>/dev/null | head -1 | xargs dirname)
ls "$CONT/Library/AsyncStorage/" 2>/dev/null | head -3
echo "=== debuglog ==="
grep -aoE "hc.debuglog.{0,400}" "$CONT/Library/AsyncStorage/RKStorage" 2>/dev/null | head -3
ls -t /var/mobile/Library/Logs/CrashReporter/HomeClock*.ips 2>/dev/null | head -1

echo "===== STAP 5: no-container entitlement ====="
S "cp $APP/HomeClock $APP/HomeClock.bak"
ldid -S/var/mobile/no-container.plist $APP/HomeClock && echo "resign-ok"
S "killall HomeClock" 2>/dev/null
sleep 1
uicache -p $APP 2>/dev/null
uiopen --bundleid nl.krimson.homeclock
sleep 15
echo "proces: $(ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l)"
CONT=$(find /var/mobile/Containers/Data/Application -maxdepth 4 -name ".com.apple.mobile_container_manager.metadata.plist" 2>/dev/null | xargs grep -l "nl.krimson.homeclock" 2>/dev/null | head -1 | xargs dirname)
ls "$CONT/Library/AsyncStorage/" 2>/dev/null | head -3
echo "=== debuglog na no-container ==="
grep -aoE "hc.debuglog.{0,400}" "$CONT/Library/AsyncStorage/RKStorage" 2>/dev/null | head -3
ls -t /var/mobile/Library/Logs/CrashReporter/HomeClock*.ips 2>/dev/null | head -1
echo "===== EIND EXPERIMENTEN ====="
REMOTE
    echo "$(date +%H:%M) experimenten afgerond" >> "$STATUS"
    exit 0
  fi
  sleep 25
done
