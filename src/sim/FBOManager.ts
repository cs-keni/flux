export interface FBO {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

export interface PingPong {
  read: FBO;
  write: FBO;
  swap(): void;
}

export class FBOManager {
  private gl: WebGL2RenderingContext;
  private fbos: FBO[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  createFBO(width: number, height: number, internalFormat: number, format: number, type: number): FBO {
    const gl = this.gl;

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);

    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const fbo: FBO = { texture, framebuffer, width, height };
    this.fbos.push(fbo);
    return fbo;
  }

  // D2: RGBA16F for velocity + dye, R16F for divergence + pressure
  createRGBA16F(width: number, height: number): FBO {
    const gl = this.gl;
    return this.createFBO(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
  }

  createR16F(width: number, height: number): FBO {
    const gl = this.gl;
    return this.createFBO(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);
  }

  createPingPong(width: number, height: number, creator: (w: number, h: number) => FBO): PingPong {
    let read = creator.call(this, width, height);
    let write = creator.call(this, width, height);
    return {
      get read() { return read; },
      get write() { return write; },
      swap() { [read, write] = [write, read]; },
    };
  }

  destroyFBO(fbo: FBO): void {
    const gl = this.gl;
    gl.deleteTexture(fbo.texture);
    gl.deleteFramebuffer(fbo.framebuffer);
    this.fbos = this.fbos.filter(f => f !== fbo);
  }

  destroyAll(): void {
    for (const fbo of this.fbos) {
      this.gl.deleteTexture(fbo.texture);
      this.gl.deleteFramebuffer(fbo.framebuffer);
    }
    this.fbos = [];
  }
}
