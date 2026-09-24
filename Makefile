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
# Build only for real phones (arm) by default: much smaller APK. Use ARCHS=all for emulators too.
ARCHS         ?= arm
# Phone-only builds are the "release" APK; ARCHS=all gets its own name so it never overwrites it.
APK_NAME := ojas-v$(VERSION)-$(if $(filter all,$(ARCHS)),universal,release).apk
ifeq ($(ARCHS),all)
  ARCH_FLAG := -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
else ifeq ($(ARCHS),arm)
  ARCH_FLAG := -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
else
  ARCH_FLAG := -PreactNativeArchitectures=$(ARCHS)
endif

.PHONY: db-check uninstall help install start android web typecheck doctor check \
        keystore apk apk-debug install-apk run-apk logs clean clean-android \
        backend backend-install migrate

help: ## Show this help
	@echo "Ojas v$(VERSION) - available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Options: ARCHS=arm (default) | all | arm64-v8a | x86_64   e.g. make apk ARCHS=all"

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

check: typecheck ## Run all checks (typecheck + expo-doctor)
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

apk: ## Build the production release APK -> build_output/
	@if [ ! -f "$(KEYSTORE_PROPS)" ]; then echo "WARNING: no release key - APK will be signed with the DEBUG key. Run 'make keystore' first."; fi
	cd $(ANDROID_DIR) && ./gradlew assembleRelease $(ARCH_FLAG)
	@mkdir -p $(OUT_DIR)
	cp $(RELEASE_APK) $(OUT_DIR)/$(APK_NAME)
	@echo "Release APK: $(OUT_DIR)/$(APK_NAME) ($$(du -h $(OUT_DIR)/$(APK_NAME) | cut -f1), built $$(date '+%d %b %H:%M'))"

apk-debug: ## Build a debug APK -> build_output/
	cd $(ANDROID_DIR) && ./gradlew assembleDebug $(ARCH_FLAG)
	@mkdir -p $(OUT_DIR)
	cp $(DEBUG_APK) $(OUT_DIR)/ojas-v$(VERSION)-debug.apk

install-apk: ## Install the release APK on the connected device (adb)
	@scripts/ensure-signature.sh release
	adb install -r $(OUT_DIR)/$(APK_NAME)

run-apk: install-apk ## Install and launch the release APK
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
