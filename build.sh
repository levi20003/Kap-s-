#!/bin/bash
# Usage: ./build.sh <versionCode> <versionName>   -> out/Fogasnaplo.apk
set -e
VC=${1:?versionCode}; VN=${2:?versionName}
ANDROID_HOME=${ANDROID_HOME:-/home/claude/android-sdk}; API=${PLATFORM:-36}; BTV=${BUILD_TOOLS:-36.0.0}
BT=$ANDROID_HOME/build-tools/$BTV; JAR=$ANDROID_HOME/platforms/android-$API/android.jar
[ -f "$JAR" ] && [ -x "$BT/aapt2" ] || { echo "Hiányzik az SDK-ból: platforms;android-$API vagy build-tools;$BTV"; echo "Telepítés: sdkmanager \"platforms;android-$API\" \"build-tools;$BTV\""; exit 1; }
P=$(cd "$(dirname "$0")" && pwd); O=$P/out; rm -rf $O; mkdir -p $O/res $O/classes $O/dex $O/gen
cd $P/app/src/main
sed 's|<manifest xmlns:android="http://schemas.android.com/apk/res/android">|<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="hu.fogasnaplo.app">|' AndroidManifest.xml > $O/AndroidManifest.xml
$BT/aapt2 compile --dir res -o $O/res/res.zip
$BT/aapt2 link -o $O/base.apk -I $JAR --manifest $O/AndroidManifest.xml -A assets \
  --min-sdk-version 24 --target-sdk-version 36 --version-code $VC --version-name $VN --java $O/gen $O/res/res.zip
javac -nowarn -source 17 -target 17 -classpath $JAR -d $O/classes java/hu/fogasnaplo/app/*.java $(find $O/gen -name "*.java")
$BT/d8 --min-api 24 --lib $JAR --release --output $O/dex $(find $O/classes -name "*.class")
cp $O/base.apk $O/unsigned.apk && (cd $O/dex && zip -q -j $O/unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $O/unsigned.apk $O/aligned.apk
PW=$(cat $P/keystore-jelszo.txt)
$BT/apksigner sign --ks $P/fogasnaplo.keystore --ks-key-alias fogasnaplo --ks-pass pass:$PW --key-pass pass:$PW --out $O/Fogasnaplo.apk $O/aligned.apk
$BT/apksigner verify $O/Fogasnaplo.apk && echo "OK: $O/Fogasnaplo.apk"
