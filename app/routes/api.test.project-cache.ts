import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { getAuth } from '@clerk/remix/ssr.server';

/**
 * POST /api/test/project-cache
 * Test endpoint to verify project caching behavior
 *
 * This endpoint helps test if the project persistence implementation is working correctly
 * by simulating multiple message submissions and tracking project creation.
 *
 * Usage:
 * curl -X POST http://localhost:5173/api/test/project-cache \
 *   -H "Content-Type: application/json" \
 *   -d '{"chatId": "test-chat-123", "messageCount": 5}'
 */
export async function action(args: ActionFunctionArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await args.request.json()) as {
      chatId: string;
      messageCount?: number;
    };

    const { chatId, messageCount = 5 } = body;

    if (!chatId) {
      return json({ error: 'chatId is required' }, { status: 400 });
    }

    console.log(`\n🧪 Starting project cache test for chatId: ${chatId}`);
    console.log(`📊 Will simulate ${messageCount} messages`);

    const results = [];
    let projectId: string | null = null;

    // Simulate multiple message submissions
    for (let i = 1; i <= messageCount; i++) {
      console.log(`\n--- Message ${i}/${messageCount} ---`);

      const startTime = Date.now();

      // Call the project creation endpoint (same as real flow)
      const response = await fetch(`${args.request.url.replace('/api/test/project-cache', '/api/projects')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': args.request.headers.get('Cookie') || '',
        },
        body: JSON.stringify({
          intent: 'create',
          url_id: chatId,
          title: `Test Project ${chatId}`,
          description: 'Test project for cache validation',
        }),
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (!response.ok) {
        return json({ error: 'Failed to create/get project' }, { status: 500 });
      }

      const result = (await response.json()) as { project?: { id: string }; existed?: boolean };

      if (i === 1) {
        projectId = result.project?.id || null;
      }

      results.push({
        messageNumber: i,
        projectId: result.project?.id,
        existed: result.existed,
        duration: `${duration}ms`,
        matchesFirst: result.project?.id === projectId,
      });

      console.log(`   Project ID: ${result.project?.id}`);
      console.log(`   Existed: ${result.existed}`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Matches First: ${result.project?.id === projectId}`);
    }

    // Analyze results
    const allMatchFirst = results.every((r) => r.projectId === projectId);
    const allExistedAfterFirst = results.slice(1).every((r) => r.existed === true);
    const firstWasCreated = results[0].existed === false;

    const analysis = {
      success: allMatchFirst && allExistedAfterFirst && firstWasCreated,
      totalMessages: messageCount,
      uniqueProjectIds: new Set(results.map((r) => r.projectId)).size,
      expectedUniqueIds: 1,
      firstMessageCreated: firstWasCreated,
      subsequentMessagesReused: allExistedAfterFirst,
      allUsedSameProject: allMatchFirst,
    };

    console.log(`\n📈 Test Results:`);
    console.log(`   ✅ Success: ${analysis.success}`);
    console.log(`   📊 Unique Project IDs: ${analysis.uniqueProjectIds} (expected: 1)`);
    console.log(`   🆕 First message created new project: ${firstWasCreated}`);
    console.log(`   ♻️  Subsequent messages reused project: ${allExistedAfterFirst}`);
    console.log(`   🎯 All messages used same project: ${allMatchFirst}`);

    return json({
      success: analysis.success,
      chatId,
      projectId,
      analysis,
      results,
      recommendations: analysis.success
        ? ['✅ Project caching is working correctly!']
        : [
            '❌ Project caching may have issues:',
            !allMatchFirst && '- Multiple different project IDs detected',
            !allExistedAfterFirst && '- Subsequent messages not reusing existing project',
            !firstWasCreated && '- First message did not create a new project',
          ].filter(Boolean),
    });
  } catch (error) {
    console.error('Error in project cache test:', error);

    return json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
