# Testing Your Deployed Pastebin-Lite App

## ✅ **Correct Test Flow**

The endpoints must be tested in order:

### **Step 1: Health Check** ✅
```
GET https://pastebin-lite-bnraa3mba-kaviyasribalagurus-projects.vercel.app/api/healthz
```
**Expected:** `{"ok":true}` ✅ **This is working!**

---

### **Step 2: Create a Paste** (POST, not GET!)
```
POST https://pastebin-lite-bnraa3mba-kaviyasribalagurus-projects.vercel.app/api/pastes
Content-Type: application/json

Body:
{
  "content": "Hello World",
  "ttl_seconds": 3600,
  "max_views": 2
}
```

**Expected:** 
```json
{
  "id": "abc123xyz",
  "url": "https://pastebin-lite-bnraa3mba-kaviyasribalagurus-projects.vercel.app/p/abc123xyz"
}
```

**OR if Upstash token is wrong:**
```json
{
  "error": "upstash_auth_failed",
  "message": "Upstash Redis token is invalid..."
}
```

**Note:** Testing with `GET /api/pastes` will return `{"error":"method_not_allowed"}` - this is **correct** (it's a POST endpoint).

---

### **Step 3: Fetch Paste** (use ID from Step 2)
```
GET https://pastebin-lite-bnraa3mba-kaviyasribalagurus-projects.vercel.app/api/pastes/abc123xyz
```
Replace `abc123xyz` with the actual ID from Step 2.

**Expected:**
```json
{
  "content": "Hello World",
  "remaining_views": 1,
  "expires_at": "2026-01-30T13:06:00.000Z"
}
```

**OR if paste doesn't exist:**
```json
{
  "error": "not_found"
}
```

---

### **Step 4: View Paste HTML** (use ID from Step 2)
```
GET https://pastebin-lite-bnraa3mba-kaviyasribalagurus-projects.vercel.app/p/abc123xyz
```
Replace `abc123xyz` with the actual ID from Step 2.

**Expected:** HTML page showing the paste content

**OR if paste doesn't exist:** 404 page

---

## 🔍 **Your Current Test Results Explained**

1. ✅ `/api/healthz` → `{"ok":true}` - **Working correctly!**

2. ⚠️ `/api/pastes` (GET) → `{"error":"method_not_allowed"}` - **This is correct!** 
   - You tested with GET, but this endpoint only accepts POST.
   - **Fix:** Use POST with a JSON body (see Step 2 above).

3. ❌ `/api/pastes/:id` → `{"error":"internal_error"}` - **This suggests Upstash token issue**
   - You tested without an actual paste ID (you need to create one first).
   - If you did use a real ID and still get `internal_error`, check:
     - Upstash token in Vercel is correct (default token, not read-only)
     - No extra spaces in the token
     - Redeploy after fixing token

4. ❌ `/p/:id` → `404` - **Expected if paste doesn't exist**
   - You need to create a paste first (Step 2) to get a valid ID.
   - Then test with that ID.

---

## 🛠️ **Quick Test Using Browser**

1. **Open:** `https://pastebin-lite-bnraa3mba-kaviyasribalagurus-projects.vercel.app/`
2. **Enter text:** "Hello World"
3. **Click:** "Create paste"
4. **If you see ID and URL:** ✅ Everything works!
5. **If you see error:** Check the error message:
   - `upstash_auth_failed` → Fix Upstash token in Vercel
   - `internal_error` → Check Vercel Function Logs for details

---

## 📋 **Check Vercel Function Logs**

If you're still getting errors:

1. Go to **Vercel Dashboard** → Your Project → **Logs** tab
2. Look for errors when you create/fetch a paste
3. The logs will show the exact error (Upstash auth, connection issues, etc.)

---

## ✅ **Expected Behavior After Fix**

Once Upstash token is correctly configured:

1. ✅ Health check returns `{"ok":true}`
2. ✅ Create paste returns `{"id":"...", "url":"..."}`
3. ✅ Fetch paste returns paste content with `remaining_views`
4. ✅ HTML view shows paste content safely rendered
