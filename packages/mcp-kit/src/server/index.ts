// Node standalone server placeholder
export interface StartNodeServerOptions {
    port?: number;
    dev?: boolean;
}

export async function startMcpNodeServer(_opts: StartNodeServerOptions = {}) {
    throw new Error('startMcpNodeServer not implemented');
}
