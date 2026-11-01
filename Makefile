# Ojas - common project commands. Run `make` or `make help` to list them.

SHELL := /bin/bash
.DEFAULT_GOAL := help

ANDROID_DIR   := android
APP_ID        := com.sankhyah.expocameratest
VERSION       := $(shell node -p "require('./app.json').expo.version" 2>/dev/null || echo 0.0.0)
OUT_DIR       := build_output
RELEASE_APK   := $(ANDROID_DIR)/app/build/outputs/apk/release/app-release.apk
DEBUG_APK     := $(ANDROID_DIR)/app/build/outputs/apk/debug/app-debug.apk
KEYSTORE      := $(ANDROID_DIR)/app/ojas-release.keystore
KEYSTORE_PROPS:= $(ANDROID_DIR)/keystore.properties
KEY_ALIAS     := ojas
# One universal APK: runs on every Android phone and on x86 emulators.
APK_NAME  := ojas-v$(VERSION)-universal.apk
ARCH_FLAG := -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# Play App Bundle: only the ARM ABIs real phones use (Play serves each phone just its own ABI).
VERSION_CODE ?=
AAB_ABIS     := armeabi-v7a,arm64-v8a
RELEASE_AAB  := $(ANDROID_DIR)/app/build/outputs/bundle/release/app-release.aab
AAB_NAME     := ojas-v$(VERSION)-$(VERSION_CODE).aab
BUNDLETOOL   ?= bundletool

.PHONY: db-check uninstall help install start android web typecheck doctor check \
        keystore apk apk-debug aab aab-test install-apk run-apk logs clean clean-android \
        backend backend-install migrate tree-pose-engine tree-pose-test tree-pose-onnx \
        warrior2-engine warrior2-test warrior2-python-test warrior2-onnx pack-logic-test

help: ## Show this help
	@echo "Ojas v$(VERSION) - available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ---------- Development ----------

install: ## Install JS dependencies
	npm install

start: ## Start the Metro dev server (dev client)
	@scripts/ensure-signature.sh debug
	npx expo start --dev-client

android: ## Build & run a debug build on a connected device/emulator
	@scripts/ensure-signature.sh debug
	npx expo run:android

web: ## Run the web version
	npx expo start --web

# ---------- Quality ----------

typecheck: ## TypeScript type check
	npx tsc --noEmit -p .

doctor: ## Expo project health check
	npx expo-doctor

tree-pose-engine: ## Re-embed the Tree Pose JS engine into the app after editing it
	node scripts/gen-tree-pose-engine.js

tree-pose-onnx: ## Re-export the Tree Pose classifier (.pth -> int8 ONNX for offline on-device use)
	python3 backend/Pose/tree_pose/export_onnx.py

tree-pose-test: ## Run the Tree Pose geometry engine tests
	node backend/Pose/tree_pose/web/test/tree_pose_engine.test.js

warrior2-engine: ## Re-embed the Warrior II JS engine into the app after editing it
	node scripts/gen-warrior2-engine.js

warrior2-onnx: ## Re-export the Warrior II classifier (.pth -> int8 ONNX for offline on-device use)
	python3 backend/Pose/warrior_pose/export_onnx.py

warrior2-test: ## Run the Warrior II geometry engine tests
	node backend/Pose/warrior_pose/web/test/warrior2_engine.test.js

warrior2-python-test: ## Run the Warrior II Python biomechanical test suite
	/home/sankhyahrick/Python/bin/python3 backend/Pose/warrior_pose/test/test_warrior2_python.py

pack-logic-test: ## Run the Play asset pack logic tests (needs Node >= 22.18, which strips TypeScript types)
	@node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)" || { echo "pack-logic-test needs Node >= 22.18 (found $$(node -v))"; exit 1; }
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/utils/assetPacksLogic.test.mjs

check: typecheck pack-logic-test ## Run all checks (typecheck + pack logic tests + expo-doctor)
	-npx expo-doctor

# ---------- Android release ----------

keystore: ## Create the production signing key (one time - BACK IT UP!)
	@if [ -f "$(KEYSTORE)" ]; then echo "Keystore already exists at $(KEYSTORE) - refusing to overwrite."; exit 1; fi
	@PASS=$$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24); \
	keytool -genkeypair -v -storetype PKCS12 -keystore "$(KEYSTORE)" -alias "$(KEY_ALIAS)" \
		-keyalg RSA -keysize 2048 -validity 10000 \
		-storepass "$$PASS" -keypass "$$PASS" \
		-dname "CN=Ojas, OU=Mobile, O=Ojas, C=IN" >/dev/null 2>&1 || { echo "keytool failed"; exit 1; }; \
	printf "storeFile=ojas-release.keystore\nstorePassword=%s\nkeyAlias=$(KEY_ALIAS)\nkeyPassword=%s\n" "$$PASS" "$$PASS" > "$(KEYSTORE_PROPS)"; \
	chmod 600 "$(KEYSTORE_PROPS)" "$(KEYSTORE)"; \
	echo "Created $(KEYSTORE) and $(KEYSTORE_PROPS)."; \
	echo "IMPORTANT: back up BOTH files somewhere safe. Losing them means you can never update the app on Play Store."

apk: ## Build the universal production APK -> build_output/
	@if [ ! -f "$(KEYSTORE_PROPS)" ]; then echo "WARNING: no release key - APK will be signed with the DEBUG key. Run 'make keystore' first."; fi
	cd $(ANDROID_DIR) && ./gradlew assembleRelease $(ARCH_FLAG)
	@mkdir -p $(OUT_DIR)
	cp $(RELEASE_APK) $(OUT_DIR)/$(APK_NAME)
	@echo "Release APK: $(OUT_DIR)/$(APK_NAME) ($$(du -h $(OUT_DIR)/$(APK_NAME) | cut -f1), built $$(date '+%d %b %H:%M'))"

apk-debug: ## Build a debug APK -> build_output/
	cd $(ANDROID_DIR) && ./gradlew assembleDebug $(ARCH_FLAG)
	@mkdir -p $(OUT_DIR)
	cp $(DEBUG_APK) $(OUT_DIR)/ojas-v$(VERSION)-debug.apk

aab: ## Build the Play App Bundle (needs VERSION_CODE=n) -> build_output/
	@test -n "$(VERSION_CODE)" || { echo "Set VERSION_CODE=<n>: Play rejects a repeated versionCode. Example: make aab VERSION_CODE=2"; exit 1; }
	@if [ ! -f "$(KEYSTORE_PROPS)" ]; then echo "WARNING: no release key - the bundle will be signed with the DEBUG key and Play will reject it. Run 'make keystore' first."; fi
	cd $(ANDROID_DIR) && ./gradlew bundleRelease -PversionCode=$(VERSION_CODE) -PreactNativeArchitectures=$(AAB_ABIS) -PabiFilters=$(AAB_ABIS)
	BUNDLETOOL=$(BUNDLETOOL) scripts/check-aab.sh $(RELEASE_AAB) $(VERSION_CODE) $(AAB_ABIS)
	@mkdir -p $(OUT_DIR)
	cp $(RELEASE_AAB) $(OUT_DIR)/$(AAB_NAME)
	@echo "App Bundle: $(OUT_DIR)/$(AAB_NAME) ($$(du -h $(OUT_DIR)/$(AAB_NAME) | cut -f1), built $$(date '+%d %b %H:%M'))"

aab-test: ## Build a test bundle (x86_64 + arm64, versionCode 1) and install it on the emulator via bundletool
	@command -v $(BUNDLETOOL) >/dev/null || { echo "bundletool not found. Install it (for example 'yay -S bundletool') or set BUNDLETOOL=/path/to/bundletool."; exit 1; }
	cd $(ANDROID_DIR) && ./gradlew bundleRelease -PversionCode=1 -PreactNativeArchitectures=x86_64,arm64-v8a -PabiFilters=x86_64,arm64-v8a
	@mkdir -p $(OUT_DIR)
	$(BUNDLETOOL) build-apks --bundle=$(RELEASE_AAB) --local-testing --overwrite --output=$(OUT_DIR)/ojas-test.apks
	$(BUNDLETOOL) install-apks --apks=$(OUT_DIR)/ojas-test.apks
	@# Keep this test bundle (x86_64, versionCode 1) away from the path a Play upload would pick up.
	mv $(RELEASE_AAB) $(OUT_DIR)/ojas-test.aab
	@echo "Installed the test bundle. It is saved as $(OUT_DIR)/ojas-test.aab (never upload this one)."

install-apk: ## Install the universal APK on the connected device (adb)
	@scripts/ensure-signature.sh release
	adb install -r $(OUT_DIR)/$(APK_NAME)

run-apk: install-apk ## Install and launch the universal APK
	adb shell monkey -p $(APP_ID) -c android.intent.category.LAUNCHER 1 >/dev/null

uninstall: ## Remove the app from the connected device
	adb uninstall $(APP_ID)

logs: ## Stream app logs from the device
	adb logcat --pid=$$(adb shell pidof -s $(APP_ID)) '*:W' ReactNativeJS:V

clean-android: ## Clean the Android native build outputs
	@# Not `gradlew clean`: with the New Architecture it deletes libraries' generated codegen
	@# before the app's CMake clean re-configures against it, which fails. Delete outputs directly.
	rm -rf $(ANDROID_DIR)/app/build $(ANDROID_DIR)/app/.cxx $(ANDROID_DIR)/build
	find node_modules -path '*/android/build' -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find node_modules -path '*/android/.cxx' -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "Android build outputs removed."

clean: clean-android ## Clean build outputs and Metro cache
	rm -rf $(OUT_DIR) .expo dist web-build

# ---------- Backend & database ----------

backend-install: ## Install Python backend dependencies
	pip install -r backend/requirements.txt

backend: ## Run the matchmaking/pose backend on :8000
	cd backend && python3 server.py

migrate: ## Apply Supabase migrations to the linked project (needs `supabase login`)
	npx supabase db push

SUPABASE_URL := https://locsjrjekkyjbeapgreu.supabase.co
SUPABASE_KEY  = $(shell grep -o "sb_publishable_[A-Za-z0-9_]*" src/utils/supabase.ts)

db-check: ## Check the live database for missing columns/tables the app needs
	@for c in daily_challenges admin is_admin news_last_seen_at daily_calories; do \
	  r=$$(curl -s "$(SUPABASE_URL)/rest/v1/profiles?select=$$c&limit=1" -H "apikey: $(SUPABASE_KEY)"); \
	  case "$$r" in *"does not exist"*) echo "MISSING column profiles.$$c";; *) echo "ok      column profiles.$$c";; esac; \
	done
	@r=$$(curl -s "$(SUPABASE_URL)/rest/v1/news?select=id&limit=1" -H "apikey: $(SUPABASE_KEY)"); \
	  case "$$r" in *PGRST205*) echo "MISSING table news";; *) echo "ok      table news";; esac
	@echo "If anything is MISSING: run supabase/apply_pending.sql in Supabase Dashboard -> SQL Editor."
