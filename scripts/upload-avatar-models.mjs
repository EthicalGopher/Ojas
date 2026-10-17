// Uploads the face and outfit GLBs to the Supabase `avatar-models` bucket (same paths as in the APK:
// avatars/faces/*.glb, avatars/outfits/*.glb). Needs the service-role key (never commit it):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-avatar-models.mjs
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://locsjrjekkyjbeapgreu.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard > Project Settings > API).');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const root = 'android/app/src/main/assets/web';
let failed = 0;

for (const dir of ['avatars/faces', 'avatars/outfits']) {
  for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith('.glb'))) {
    const path = `${dir}/${file}`;
    const { error } = await supabase.storage
      .from('avatar-models')
      .upload(path, readFileSync(join(root, path)), {
        contentType: 'model/gltf-binary',
        cacheControl: '31536000',
        upsert: true,
      });
    console.log(error ? `FAIL ${path}: ${error.message}` : `ok   ${path}`);
    if (error) failed++;
  }
}
process.exit(failed ? 1 : 0);
