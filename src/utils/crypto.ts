import crypto from "node:crypto";

/**
 * 生成带自定义前缀的 UUID
 * @param name 前缀名称（如 'point'）
 * @returns 例如: 'point-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
 */
export function generateUuid(name?: string): string {
    const id = crypto.randomUUID();
    return name ? `${name}-${id}` : id;
}

