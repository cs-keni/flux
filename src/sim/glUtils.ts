export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    // D18: show in DEV, throw in both (will surface via dev overlay in T18)
    if (import.meta.env.DEV) {
      const label = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      console.error(`[flux] ${label} shader compile error:\n${log}`);
    }
    throw new Error(`Shader compile failed: ${log}`);
  }

  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vert);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, frag);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    if (import.meta.env.DEV) {
      console.error(`[flux] program link error:\n${log}`);
    }
    throw new Error(`Program link failed: ${log}`);
  }

  return program;
}
