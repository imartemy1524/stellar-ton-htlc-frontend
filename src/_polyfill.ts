import { Buffer } from 'buffer';

interface WindowWithBuffer extends Window {
    Buffer?: typeof Buffer;
}

(window as WindowWithBuffer).Buffer = Buffer;
