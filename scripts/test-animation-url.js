#!/usr/bin/env node

/**
 * Test script to verify animation_url HTML structure
 * This helps confirm the fix for OpenSea iframe rendering
 */

import https from 'https';

// Fetch metadata from OpenSea API
async function fetchMetadata(contractAddress, tokenId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.opensea.io/api/v2/metadata/ethereum/${contractAddress}/${tokenId}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Extract HTML from animation_url
function extractHTML(animationUrl) {
  if (animationUrl.startsWith('data:text/html;base64,')) {
    const base64 = animationUrl.replace('data:text/html;base64,', '');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } else if (animationUrl.startsWith('https://')) {
    // OpenSea may have converted it to a hosted URL
    return null; // Would need to fetch
  }
  return null;
}

// Analyze HTML structure
function analyzeHTML(html) {
  const analysis = {
    hasHTMLTag: /<html/i.test(html),
    hasHeadTag: /<head/i.test(html),
    hasBodyTag: /<body/i.test(html),
    hasStyleTag: /<style/i.test(html),
    hasViewportMeta: /viewport/i.test(html),
    hasViewportCSS: /html.*body.*width.*100%.*height.*100%/i.test(html.replace(/\s/g, '')),
    htmlLength: html.length,
    first500Chars: html.substring(0, 500)
  };
  
  // Check for the specific CSS we're adding
  const hasOurCSS = /html.*body.*width:\s*100%.*height:\s*100%.*margin:\s*0.*padding:\s*0/i.test(html.replace(/\s/g, ''));
  analysis.hasOurViewportCSS = hasOurCSS;
  
  return analysis;
}

// Main test function
async function testToken(contractAddress, tokenId) {
  console.log(`\n🔍 Testing token ${tokenId} from contract ${contractAddress}\n`);
  console.log('=' .repeat(60));
  
  try {
    // Fetch metadata
    console.log('📡 Fetching metadata from OpenSea...');
    const metadata = await fetchMetadata(contractAddress, tokenId);
    
    if (!metadata.animation_url) {
      console.log('❌ No animation_url found in metadata');
      return;
    }
    
    console.log('✅ Found animation_url');
    console.log(`   Type: ${metadata.animation_url.substring(0, 50)}...`);
    
    // If it's a hosted URL, fetch it
    let html;
    if (metadata.animation_url.startsWith('https://')) {
      console.log('📥 Fetching HTML from hosted URL...');
      const response = await fetch(metadata.animation_url);
      html = await response.text();
    } else {
      html = extractHTML(metadata.animation_url);
    }
    
    if (!html) {
      console.log('❌ Could not extract HTML from animation_url');
      return;
    }
    
    console.log(`✅ Extracted HTML (${html.length} characters)\n`);
    
    // Analyze
    const analysis = analyzeHTML(html);
    
    console.log('📊 HTML Structure Analysis:');
    console.log('─'.repeat(60));
    console.log(`Has <html> tag:        ${analysis.hasHTMLTag ? '✅' : '❌'}`);
    console.log(`Has <head> tag:        ${analysis.hasHeadTag ? '✅' : '❌'}`);
    console.log(`Has <body> tag:        ${analysis.hasBodyTag ? '✅' : '❌'}`);
    console.log(`Has <style> tag:      ${analysis.hasStyleTag ? '✅' : '❌'}`);
    console.log(`Has viewport meta:     ${analysis.hasViewportMeta ? '✅' : '❌'}`);
    console.log(`Has viewport CSS:      ${analysis.hasViewportCSS ? '✅' : '❌'}`);
    console.log(`Has our viewport CSS:  ${analysis.hasOurViewportCSS ? '✅' : '❌'}`);
    console.log('');
    
    // Diagnosis
    console.log('🔬 Diagnosis:');
    console.log('─'.repeat(60));
    
    if (!analysis.hasStyleTag) {
      console.log('❌ ISSUE FOUND: No <style> tag in HTML');
      console.log('   → This is likely causing the white screen on OpenSea');
      console.log('   → The fix adds a <style> tag with viewport CSS');
    } else if (!analysis.hasOurViewportCSS) {
      console.log('⚠️  WARNING: Has <style> tag but missing viewport CSS');
      console.log('   → May still have rendering issues');
    } else {
      console.log('✅ HTML structure looks correct!');
      console.log('   → Should render properly in OpenSea iframe');
    }
    
    console.log('\n📝 First 500 characters of HTML:');
    console.log('─'.repeat(60));
    console.log(analysis.first500Chars);
    console.log('─'.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run test
const contractAddress = process.argv[2] || '0x008b66385ed2346e6895031e250b2ac8dc14605c';
const tokenId = process.argv[3] || '2';

testToken(contractAddress, tokenId);
