#!/bin/bash
# Usage: ./build.sh <versionCode> <versionName>   -> out/Fogasnaplo.apk
# A side-by-side test app: APP_ID=hu.fogasnaplo.app.teszt LABEL="Kapás" ./build.sh ...
# Google Play bundle as well: AAB=1 ./build.sh ...  -> out/Fogasnaplo.aab (needs bundletool: BUNDLETOOL=/path/bundletool.jar, default ./bundletool.jar)
set -e
VC=${1:?versionCode}; VN=${2:?versionName}; APP_ID=${APP_ID:-hu.fogasnaplo.app}; LABEL=${LABEL:-Kapás}
ANDROID_HOME=${ANDROID_HOME:-/home/claude/android-sdk}; API=${PLATFORM:-36}; BTV=${BUILD_TOOLS:-36.0.0}
BT=$ANDROID_HOME/build-tools/$BTV; JAR=$ANDROID_HOME/platforms/android-$API/android.jar
[ -f "$JAR" ] && [ -x "$BT/aapt2" ] || { echo "Hiányzik az SDK-ból: platforms;android-$API vagy build-tools;$BTV"; echo "Telepítés: sdkmanager \"platforms;android-$API\" \"build-tools;$BTV\""; exit 1; }
P=$(cd "$(dirname "$0")" && pwd); O=$P/out; rm -rf $O; mkdir -p $O/res $O/classes $O/dex $O/gen
cd $P/app/src/main
sed -e 's|<manifest xmlns:android="http://schemas.android.com/apk/res/android">|<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="hu.fogasnaplo.app">|' \
    -e "s|android:authorities=\"hu.fogasnaplo.app.shot\"|android:authorities=\"$APP_ID.shot\"|" -e "s|android:label=\"Kapás\"|android:label=\"$LABEL\"|" \
    AndroidManifest.xml > $O/AndroidManifest.xml
# test build: switch on the self-update parts (install permissions, update receiver)
[ "$APP_ID" != hu.fogasnaplo.app ] && sed -i -e 's|<!--TESZT:\(.*\)-->|\1|' -e "s|android:authorities=\"hu.fogasnaplo.app.update\"|android:authorities=\"$APP_ID.update\"|" $O/AndroidManifest.xml
RENAME=; [ "$APP_ID" != hu.fogasnaplo.app ] && RENAME="--rename-manifest-package $APP_ID" # code and R stay in hu.fogasnaplo.app
$BT/aapt2 compile --dir res -o $O/res/res.zip
$BT/aapt2 link -o $O/base.apk -I $JAR --manifest $O/AndroidManifest.xml -A assets \
  --min-sdk-version 24 --target-sdk-version 36 --version-code $VC --version-name $VN --java $O/gen $RENAME $O/res/res.zip
javac -nowarn -source 17 -target 17 -classpath $JAR -d $O/classes java/hu/fogasnaplo/app/*.java $(find $O/gen -name "*.java")
$BT/d8 --min-api 24 --lib $JAR --release --output $O/dex $(find $O/classes -name "*.class")
cp $O/base.apk $O/unsigned.apk && (cd $O/dex && zip -q -j $O/unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $O/unsigned.apk $O/aligned.apk
PW=$(cat $P/keystore-jelszo.txt)
$BT/apksigner sign --ks $P/fogasnaplo.keystore --ks-key-alias fogasnaplo --ks-pass pass:$PW --key-pass pass:$PW --out $O/Fogasnaplo.apk $O/aligned.apk
$BT/apksigner verify $O/Fogasnaplo.apk && echo "OK: $O/Fogasnaplo.apk"
[ "$AAB" = 1 ] || exit 0
# Android App Bundle: the same resources linked in proto format, laid out as a bundletool "base" module
BTOOL=${BUNDLETOOL:-$P/bundletool.jar}
[ -f "$BTOOL" ] || { echo "Hiányzik a bundletool: $BTOOL (letöltés: https://github.com/google/bundletool/releases)"; exit 1; }
cd $P/app/src/main
$BT/aapt2 link --proto-format -o $O/proto.apk -I $JAR --manifest $O/AndroidManifest.xml -A assets \
  --min-sdk-version 24 --target-sdk-version 36 --version-code $VC --version-name $VN $RENAME $O/res/res.zip
rm -rf $O/protox $O/base $O/base.zip && mkdir -p $O/base/manifest $O/base/dex && unzip -q $O/proto.apk -d $O/protox
mv $O/protox/AndroidManifest.xml $O/base/manifest/ && mv $O/protox/resources.pb $O/base/
for d in res assets; do [ -d $O/protox/$d ] && mv $O/protox/$d $O/base/; done
cp $O/dex/classes.dex $O/base/dex/
(cd $O/base && zip -q -r $O/base.zip .)
java -jar $BTOOL build-bundle --modules=$O/base.zip --output=$O/Fogasnaplo.aab --overwrite
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore $P/fogasnaplo.keystore -storepass "$PW" -keypass "$PW" $O/Fogasnaplo.aab fogasnaplo > /dev/null
java -jar $BTOOL validate --bundle=$O/Fogasnaplo.aab > /dev/null && jarsigner -verify $O/Fogasnaplo.aab > /dev/null && echo "OK: $O/Fogasnaplo.aab"
