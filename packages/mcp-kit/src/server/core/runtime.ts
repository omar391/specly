/**
 * Runtime detection utilities for conditional loading and environment-specific optimizations
 */

import type { RuntimeInfo } from './types.js';

export function detectRuntime(): RuntimeInfo {
    const globalObj = globalThis as any;

    // Check for specific runtime globals
    const isNode = typeof process !== 'undefined' && !!process.versions?.node;
    const isBun = typeof globalObj.Bun !== 'undefined';
    const isDeno = typeof globalObj.Deno !== 'undefined';

    // Check for edge runtime environments
    const isCloudflare = typeof globalObj.caches !== 'undefined' && typeof globalObj.WebSocketPair !== 'undefined';
    const isVercel = typeof globalObj.__VERCEL__ !== 'undefined' || (typeof globalObj.process !== 'undefined' && globalObj.process.env?.VERCEL);
    const isNetlify = typeof globalObj.Netlify !== 'undefined' || globalObj.process?.env?.NETLIFY;

    // Check for web APIs
    const hasFetch = typeof globalObj.fetch !== 'undefined';
    const hasWebCrypto = typeof globalObj.crypto !== 'undefined' && typeof globalObj.crypto.subtle !== 'undefined';

    let name = 'unknown';
    let version: string | undefined;

    if (isNode) {
        name = 'node';
        version = process.versions.node;
    } else if (isBun) {
        name = 'bun';
        version = globalObj.Bun.version;
    } else if (isDeno) {
        name = 'deno';
        version = globalObj.Deno.version?.deno;
    } else if (isCloudflare) {
        name = 'cloudflare';
    } else if (isVercel) {
        name = 'vercel';
    } else if (isNetlify) {
        name = 'netlify';
    } else if (hasFetch) {
        name = 'browser';
    }

    return {
        name,
        version,
        isNode,
        isBun,
        isDeno,
        isCloudflare,
        isVercel,
        isNetlify,
        hasFetch,
        hasWebCrypto,
    };
}

/**
 * Check if we're running in a Node.js-like environment (Node.js or Bun)
 */
export function isNodeLike(): boolean {
    const runtime = detectRuntime();
    return runtime.isNode || runtime.isBun;
}

/**
 * Check if we're running in an edge/serverless environment
 */
export function isEdgeRuntime(): boolean {
    const runtime = detectRuntime();
    return runtime.isCloudflare || runtime.isVercel || runtime.isNetlify || runtime.isDeno;
}

/**
 * Get the current runtime info (cached for performance)
 */
let cachedRuntime: RuntimeInfo | null = null;
export function getRuntimeInfo(): RuntimeInfo {
    if (!cachedRuntime) {
        cachedRuntime = detectRuntime();
    }
    return cachedRuntime;
}

/**
 * Clear the cached runtime info (for testing purposes)
 */
export function clearRuntimeCache(): void {
    cachedRuntime = null;
}