const hashes = new Set([
  '42539ad76233778a791bcc381f53e9ead8d8484ff41ab79d0fa25b420976e726',
  'abde97ca9466280b0013c160c1a55ba5527351a9653dc20150b411ae9fdea818',
  '7bc6b2feacc5f5c4cdd03cb0fbc0dd0ce4b3908686cbf60311fe8d771b73f765',
  '50c75e3488b467218d1b019bec2b73bc5fee2e179f9c5d307364fe07f20c10c6',
  '46cce57132a5f2076e2c24ae43c3cded7a386e56938b0bd358f84ea9b5ccc97a',
  'c91614313dac1640340e36b7a9074c1d93e5b6a820295a808c0393f989f89a99',
  '3e6d62adc6fbe444ac463fbfcff3330acbe6e14b339388726f37850ff0651927',
  '4b291cf2b1f99124efbb64d3e00d586b92e15f796ab2594cbf86e607df8f7ad8',
  'c6701e16bf77f5ee05a7ebdb33774f4ac6e91444ca3a6a76363fa81d6024eb53',
  '5036d001ddac5edba600eff14ba28a922e723fe247e23f900e128b94edbeac72',
  'bab10526f60a2d4fdd7d807571d736b85b4794b0f33aa3f9394e1895cfabc97a',
  '5a05c4c108ef10eb5d8cb6f7e7e1049214a441a68b0ce1fb6064fd152d49dd01',
  '85f5012c81656bb37b16a008b8a1cd6d8d0c2af4fefc06dd76cf1ec0a3d0f96a'
]);

export async function isEndgamer(raw, allowedHashes = hashes) {
  const names = Array.isArray(raw?.charNames) ? raw.charNames : [];
  const matches = await Promise.all(names.filter(name => typeof name === 'string').map(async name => {
    if (!globalThis.crypto?.subtle) throw new Error('Name checking requires HTTPS or localhost.');
    const bytes = new TextEncoder().encode(name.trim().toLowerCase());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return allowedHashes.has(hash);
  }));
  return matches.some(Boolean);
}
