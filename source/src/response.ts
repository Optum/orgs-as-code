export type FailedResponse = {
  Success: false;
  Error?: any;
  ErrorMessage: string;
};

export type SuccessResponse<T> = {
  Success: true;
  Data: T;
};

export type Response<T> = FailedResponse | SuccessResponse<T>;

export type GraphqlResponseErrorType = "NOT_FOUND" | "OTHER";

export type GraphqlResponseError = {
  name: "GraphqlResponseError",
  errors: {type:GraphqlResponseErrorType}[]
}