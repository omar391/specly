#!/bin/bash

echo "🚀 Testing Specly Development Setup"
echo "======================================"

echo -n "✅ MCP Backend Health Check: "
curl -s http://localhost:8989/health | jq -r '.status'

echo -n "✅ UI Dev Server: "
curl -s -I http://localhost:5173 | head -1 | cut -d' ' -f2

echo -n "✅ CORS Test (from UI to Backend): "
CORS_RESULT=$(curl -s -H "Origin: http://localhost:5173" http://localhost:8989/api/workspaces)
if echo "${CORS_RESULT}" | grep -q '"workspaces"'; then
	echo "✅ OK"
else
	echo "❌ Failed"
fi

echo "✅ Backend API Discovery:"
curl -s http://localhost:8989 | jq '.endpoints'

echo ""
echo "🎉 Development setup ready!"
echo "   UI: http://localhost:5173"
echo "   API: http://localhost:8989"
