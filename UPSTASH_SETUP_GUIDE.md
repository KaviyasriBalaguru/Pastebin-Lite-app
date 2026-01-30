# Upstash Redis Setup Guide for Vercel

## 🔴 Current Issue: "internal_error" when creating paste

This error occurs because **Upstash Redis is not configured** in your Vercel deployment.

---

## ✅ **Step-by-Step Fix**

### **Step 1: Create Upstash Redis Database**

1. Go to **https://upstash.com/**
2. Sign up or log in (free tier available)
3. Click **"Create Database"**
4. Choose:
   - **Name:** `pastebin-lite` (or any name)
   - **Type:** Redis
   - **Region:** Choose closest to your Vercel region
   - **Plan:** Free tier is fine
5. Click **"Create"**

### **Step 2: Get Your Credentials**

After creating the database:

1. Open your database in **Upstash Console** → **REST** tab.
2. **Important:** Use the **default token** (read-write), **not** the "Read-Only Token".
   - Leave **"Read-Only Token"** **unchecked** when copying.
   - The app needs write access to create/update pastes.
3. Copy these two values **exactly** (no leading/trailing spaces):
   - **UPSTASH_REDIS_REST_URL** (e.g. `https://good-gelding-38095.upstash.io`)
   - **UPSTASH_REDIS_REST_TOKEN** (the long token — default, not read-only)

### **Step 3: Add Environment Variables in Vercel**

1. Go to **Vercel Dashboard**: https://vercel.com/kaviyasribalagurus-projects/pastebin-lite-app
2. Click **"Settings"** tab (top navigation)
3. Click **"Environment Variables"** (left sidebar)
4. Add these **3 variables**:

   | Variable Name | Value | Environment |
   |--------------|-------|-------------|
   | `DB_DRIVER` | `upstash` | Production, Preview, Development |
   | `UPSTASH_REDIS_REST_URL` | `https://xxxxx.upstash.io` | Production, Preview, Development |
   | `UPSTASH_REDIS_REST_TOKEN` | `your-token-here` | Production, Preview, Development |

5. For each variable:
   - Click **"Add New"**
   - Enter the **Variable Name**
   - Enter the **Value**
   - Select **All Environments** (Production, Preview, Development)
   - Click **"Save"**

### **Step 4: Redeploy**

After adding all environment variables:

1. Go to **"Deployments"** tab
2. Find the latest deployment
3. Click the **"⋯"** (three dots) menu
4. Click **"Redeploy"**
5. Wait for deployment to complete (usually 1-2 minutes)

### **Step 5: Test**

1. Go to: `https://pastebin-lite-l5o7nvqht-kaviyasribalagurus-projects.vercel.app/`
2. Enter some text (e.g., "Hello World")
3. Optionally set TTL (e.g., 3600) and Max views (e.g., 2)
4. Click **"Create paste"**
5. **Expected:** You should see an **ID** and **URL** (no more "internal_error"!)

---

## 🔍 **Verification Checklist**

After setup, verify these endpoints work:

### ✅ Health Check
- URL: `https://pastebin-lite-l5o7nvqht-kaviyasribalagurus-projects.vercel.app/api/healthz`
- Expected: `{ "ok": true }`

### ✅ Create Paste
- URL: `https://pastebin-lite-l5o7nvqht-kaviyasribalagurus-projects.vercel.app/`
- Action: Fill form and click "Create paste"
- Expected: Returns ID and URL

### ✅ View Paste
- Click the generated URL
- Expected: Paste content displays correctly

---

## 🐛 **Troubleshooting**

### "WRONGPASS" or "invalid or missing auth token" (upstash_auth_failed)

This means **UPSTASH_REDIS_REST_TOKEN** in Vercel is wrong:

1. **Use the default token, not read-only**
   - In Upstash Console → your database → **REST** tab.
   - Ensure **"Read-Only Token"** is **unchecked**.
   - Copy the token shown there (the main one, not the read-only one).

2. **No extra spaces**
   - When pasting into Vercel, don’t add spaces before or after the token.

3. **Update in Vercel and redeploy**
   - Vercel → Settings → Environment Variables.
   - Edit **UPSTASH_REDIS_REST_TOKEN** and paste the correct token.
   - Save, then **Redeploy** (Deployments → ⋯ → Redeploy).

4. **Regenerate token if needed**
   - In Upstash, you can create a new token if the current one was copied wrong or rotated.

### Still seeing "internal_error"?

1. **Check Environment Variables:**
   - Go to Vercel → Settings → Environment Variables
   - Verify all 3 variables are set correctly
   - Make sure they're enabled for **Production** environment

2. **Check Deployment Logs:**
   - Go to Vercel → Deployments → Latest deployment → Logs
   - Look for any error messages related to Redis or database

3. **Verify Upstash Database:**
   - Go to Upstash dashboard
   - Make sure your database is **Active** (not paused)
   - Check that the URL and token are correct

4. **Redeploy:**
   - After changing environment variables, **always redeploy**
   - Environment variables don't apply to existing deployments

### Getting "database_not_configured" error?

This is actually **good** - it means the error handling is working! It confirms that Upstash Redis is not configured. Follow the steps above to set it up.

---

## 📝 **Quick Reference**

**Required Environment Variables:**
```
DB_DRIVER=upstash
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

**Where to find them:**
- Upstash Dashboard → Your Database → Details

**Where to set them:**
- Vercel Dashboard → Your Project → Settings → Environment Variables

---

## ✅ **Success Indicators**

Once configured correctly, you should see:
- ✅ No "internal_error" when creating pastes
- ✅ Paste creation returns ID and URL
- ✅ Pastes can be viewed via the generated URL
- ✅ View limits and TTL work correctly

---

**Need Help?** Check the Vercel Function Logs for detailed error messages.
