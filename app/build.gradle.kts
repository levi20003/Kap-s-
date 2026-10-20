plugins {
    id("com.android.application")
}

android {
    namespace = "hu.fogasnaplo.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "hu.fogasnaplo.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 9
        versionName = "1.8"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../fogasnaplo.keystore")
            storePassword = System.getenv("FN_KS_PASS")
            keyAlias = "fogasnaplo"
            keyPassword = System.getenv("FN_KS_PASS")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
