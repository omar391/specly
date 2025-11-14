#!/bin/bash
# Remove existing agents in .github if it exists
rm -rf .github/agents
# Create symlink from .github/agents to ../agents (relative to .github/)
ln -s ../agents .github/agents