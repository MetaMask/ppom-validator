import IdIterator from 'json-rpc-random-id';

export const createPayload = (data: any) => {
  data.id = IdIterator();
  data.jsonrpc = '2.0';
  data.params = data.params || [];
  return data;
};
