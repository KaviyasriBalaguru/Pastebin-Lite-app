/**
 * Live Vercel Deployment Test Script
 * Run with: node test-live.js
 */

const BASE_URL = "https://pastebin-lite-l5o7nvqht-kaviyasribalagurus-projects.vercel.app";

async function testEndpoint(name, url, options = {}) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url, options);
    const text = await response.text();
    let json;
    
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Response:`, json || text.substring(0, 100));
    
    return { status: response.status, json, text };
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    return { error: error.message };
  }
}

async function runTests() {
  console.log("=".repeat(60));
  console.log("PASTEBIN-LITE LIVE DEPLOYMENT TEST");
  console.log("=".repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  
  // Test 1: Health Check
  const healthz = await testEndpoint(
    "Health Check",
    `${BASE_URL}/api/healthz`
  );
  
  // Test 2: Create Paste (POST)
  const createResult = await testEndpoint(
    "Create Paste",
    `${BASE_URL}/api/pastes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Test paste from automated test",
        ttl_seconds: 300,
        max_views: 3
      })
    }
  );
  
  let pasteId = null;
  if (createResult.json && createResult.json.id) {
    pasteId = createResult.json.id;
    console.log(`\n✅ Paste created successfully! ID: ${pasteId}`);
    
    // Test 3: Fetch Paste
    await testEndpoint(
      "Fetch Paste (1st view)",
      `${BASE_URL}/api/pastes/${pasteId}`
    );
    
    // Test 4: Fetch Paste again (2nd view)
    await testEndpoint(
      "Fetch Paste (2nd view)",
      `${BASE_URL}/api/pastes/${pasteId}`
    );
    
    // Test 5: HTML View
    const htmlView = await testEndpoint(
      "HTML View",
      `${BASE_URL}/p/${pasteId}`
    );
    
    if (htmlView.status === 200) {
      console.log(`   ✅ HTML page loaded (3rd view - should consume last view)`);
    }
    
    // Test 6: Verify paste is exhausted (4th attempt should 404)
    await testEndpoint(
      "Fetch Paste (should be exhausted - 404)",
      `${BASE_URL}/api/pastes/${pasteId}`
    );
  } else {
    console.log(`\n❌ Failed to create paste. Cannot continue with remaining tests.`);
  }
  
  // Test 7: Invalid input
  await testEndpoint(
    "Invalid Input (empty content)",
    `${BASE_URL}/api/pastes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" })
    }
  );
  
  // Test 8: Invalid input (negative ttl)
  await testEndpoint(
    "Invalid Input (negative ttl_seconds)",
    `${BASE_URL}/api/pastes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test", ttl_seconds: -1 })
    }
  );
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  
  if (healthz.status === 200 && healthz.json?.ok === true) {
    console.log("✅ Health check: PASSED");
  } else {
    console.log("❌ Health check: FAILED");
  }
  
  if (createResult.status === 201 && createResult.json?.id && createResult.json?.url) {
    console.log("✅ Create paste: PASSED");
  } else {
    console.log("❌ Create paste: FAILED");
    console.log("   This is likely due to Upstash Redis not being configured.");
    console.log("   Check Vercel environment variables:");
    console.log("   - DB_DRIVER=upstash");
    console.log("   - UPSTASH_REDIS_REST_URL");
    console.log("   - UPSTASH_REDIS_REST_TOKEN");
  }
  
  console.log("\n📋 Manual Test Checklist:");
  console.log("1. Open https://pastebin-lite-l5o7nvqht-kaviyasribalagurus-projects.vercel.app/");
  console.log("2. Enter some text in the Content field");
  console.log("3. Click 'Create paste'");
  console.log("4. You should see an ID and URL");
  console.log("5. Click the URL to view the paste");
  console.log("6. The paste should display correctly");
}

runTests().catch(console.error);
