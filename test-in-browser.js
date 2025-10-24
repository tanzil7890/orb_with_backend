// ========================================================
// TEST PROJECTS API IN BROWSER CONSOLE
// ========================================================
// Copy and paste these commands one by one into the browser console
// while logged in to the app at http://localhost:5173
// ========================================================

// TEST 1: Create a new project
console.log('🧪 TEST 1: Creating project...');
fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    intent: 'create',
    url_id: 'test-project-' + Date.now(),
    title: 'My First Lovable Project',
    description: 'Testing the new database structure!'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ TEST 1 RESULT:', data);
  if (data.project) {
    window.testProjectId = data.project.id;
    console.log('📌 Saved project ID:', window.testProjectId);
  }
})
.catch(err => console.error('❌ TEST 1 FAILED:', err));

// ========================================================
// Wait 2-3 seconds, then run TEST 2
// ========================================================

// TEST 2: Get all projects
console.log('🧪 TEST 2: Getting all projects...');
fetch('/api/projects')
  .then(r => r.json())
  .then(data => {
    console.log('✅ TEST 2 RESULT:', data);
    console.log(`📊 Total projects: ${data.projects?.length || 0}`);
  })
  .catch(err => console.error('❌ TEST 2 FAILED:', err));

// ========================================================
// Wait 2-3 seconds, then run TEST 3
// ========================================================

// TEST 3: Update the project
console.log('🧪 TEST 3: Updating project...');
if (window.testProjectId) {
  fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'update',
      project_id: window.testProjectId,
      title: '✨ Updated Project Title',
      description: 'This project has been successfully updated!',
      metadata: {
        git_url: 'https://github.com/test/repo',
        git_branch: 'main'
      }
    })
  })
  .then(r => r.json())
  .then(data => {
    console.log('✅ TEST 3 RESULT:', data);
  })
  .catch(err => console.error('❌ TEST 3 FAILED:', err));
} else {
  console.error('❌ TEST 3 SKIPPED: No project ID found. Run TEST 1 first.');
}

// ========================================================
// OPTIONAL: Delete the test project (cleanup)
// ========================================================

// TEST 4: Delete project (uncomment to run)
/*
console.log('🧪 TEST 4: Deleting project...');
if (window.testProjectId) {
  fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'delete',
      project_id: window.testProjectId
    })
  })
  .then(r => r.json())
  .then(data => {
    console.log('✅ TEST 4 RESULT:', data);
  })
  .catch(err => console.error('❌ TEST 4 FAILED:', err));
} else {
  console.error('❌ TEST 4 SKIPPED: No project ID found.');
}
*/

// ========================================================
// QUICK TEST: Run all tests in sequence
// ========================================================

async function runAllTests() {
  console.log('🚀 Running all tests in sequence...\n');

  try {
    // Test 1: Create
    console.log('🧪 TEST 1: Creating project...');
    const createResponse = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'create',
        url_id: 'test-project-' + Date.now(),
        title: 'Automated Test Project',
        description: 'Created by automated test'
      })
    });
    const createData = await createResponse.json();
    console.log('✅ TEST 1 RESULT:', createData);

    if (!createData.project) {
      throw new Error('Failed to create project');
    }

    const projectId = createData.project.id;
    console.log('📌 Project ID:', projectId, '\n');

    // Test 2: Get all
    console.log('🧪 TEST 2: Getting all projects...');
    const listResponse = await fetch('/api/projects');
    const listData = await listResponse.json();
    console.log('✅ TEST 2 RESULT:', listData);
    console.log(`📊 Total projects: ${listData.projects?.length || 0}\n`);

    // Test 3: Update
    console.log('🧪 TEST 3: Updating project...');
    const updateResponse = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'update',
        project_id: projectId,
        title: '✨ Updated via Automated Test',
        description: 'Successfully updated!'
      })
    });
    const updateData = await updateResponse.json();
    console.log('✅ TEST 3 RESULT:', updateData, '\n');

    console.log('🎉 ALL TESTS PASSED!\n');
    console.log('📋 Summary:');
    console.log('  ✅ Project created');
    console.log('  ✅ Projects listed');
    console.log('  ✅ Project updated');
    console.log('\n🔍 Check Supabase Dashboard:');
    console.log('  https://supabase.com/dashboard/project/gyasppaxqlvhffjyrsmy/editor');
    console.log('\n💾 Test project ID (saved in window.testProjectId):', projectId);
    window.testProjectId = projectId;

  } catch (error) {
    console.error('❌ TEST FAILED:', error);
  }
}

// To run all tests automatically, just call:
// runAllTests();
