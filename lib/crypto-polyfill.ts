import * as ExpoCrypto from 'expo-crypto';

type DigestInput = ArrayBuffer | ArrayBufferView;

type NativeCryptoApi = {
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
  subtle?: {
    digest?: (algorithm: string | { name: string }, data: DigestInput) => Promise<ArrayBuffer>;
  };
};

type RuntimeGlobals = {
  crypto?: NativeCryptoApi;
  TextEncoder?: new () => {
    encode: (value?: string) => Uint8Array;
    encodeInto?: (source: string, destination: Uint8Array) => { read: number; written: number };
  };
};

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function installTextEncoder(runtime: RuntimeGlobals) {
  if (runtime.TextEncoder) return;

  runtime.TextEncoder = class {
    readonly encoding = 'utf-8';

    encode(value = '') {
      return encodeUtf8(value);
    }

    encodeInto(source: string, destination: Uint8Array) {
      let read = 0;
      let written = 0;
      for (const character of source) {
        const encoded = encodeUtf8(character);
        if (written + encoded.length > destination.length) break;
        destination.set(encoded, written);
        read += character.length;
        written += encoded.length;
      }
      return { read, written };
    }
  };
}

function installWebCrypto(runtime: RuntimeGlobals) {
  const cryptoApi = runtime.crypto ?? {};

  // Expo Crypto uses the platform's secure random generator in native builds.
  cryptoApi.getRandomValues ??= <T extends ArrayBufferView>(array: T) =>
    ExpoCrypto.getRandomValues(array as unknown as Parameters<typeof ExpoCrypto.getRandomValues>[0]) as unknown as T;

  cryptoApi.subtle ??= {};
  cryptoApi.subtle.digest ??= async (algorithm, data) => {
    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
    if (name.toUpperCase().replace('_', '-') !== 'SHA-256') {
      throw new Error(`Algorithme WebCrypto non pris en charge par le polyfill Expo : ${name}`);
    }

    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const input = String.fromCharCode(...bytes);
    const hex = await ExpoCrypto.digestStringAsync(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      input,
      { encoding: ExpoCrypto.CryptoEncoding.HEX },
    );
    const digest = new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    return digest.buffer;
  };

  Object.defineProperty(runtime, 'crypto', {
    configurable: true,
    value: cryptoApi,
    writable: true,
  });
}

const runtime = globalThis as unknown as RuntimeGlobals;
installTextEncoder(runtime);
installWebCrypto(runtime);
