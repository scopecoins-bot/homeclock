#!/bin/bash
# Morgen-automaat: installeert de diagnostische bundel zodra de iPad zichtbaar is.
cd "C:/Users/Gebruiker/.zcode/workspace/default/homeclock/apps/ipad"
STATUS="C:/Users/Gebruiker/.zcode/workspace/default/homeclock/nacht-status.txt"
while true; do
  for ip in 192.168.137.149 192.168.137.50 192.168.137.171 192.168.137.239; do
    ssh-keygen -R $ip >/dev/null 2>&1
    if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 mobile@$ip 'true' 2>/dev/null; then
      echo "$(date +%H:%M) ONLINE: $ip — diagnostische bundel installeren" >> "$STATUS"
      scp -q -o StrictHostKeyChecking=accept-new local-app3.hbc mobile@$ip:/tmp/local-app3.hbc && \
      ssh -o StrictHostKeyChecking=accept-new mobile@$ip 'sudo cp /tmp/local-app3.hbc /var/jb/Applications/HomeClock.app/main.jsbundle; sudo killall HomeClock 2>/dev/null; sleep 1; uiopen --bundleid nl.krimson.homeclock; sleep 15; echo PROCES: $(ps aux | grep -i [H]omeClock | grep -v zsh | grep -v grep | wc -l)' 2>&1 | grep -v "zsh/watch" >> "$STATUS"
      echo "$(date +%H:%M) KLAAR" >> "$STATUS"
      exit 0
    fi
  done
  sleep 20
done
