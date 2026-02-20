export const createMockReq = ({
  method = 'POST',
  body = undefined,
  headers = {},
  ip = '127.0.0.1'
} = {}) => ({
  method,
  body,
  headers,
  socket: { remoteAddress: ip }
});

export const createMockRes = () => {
  const headers = new Map();

  const res = {
    statusCode: 200,
    headers,
    body: undefined,
    ended: false,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      this.body = payload;
      return this;
    }
  };

  return res;
};
