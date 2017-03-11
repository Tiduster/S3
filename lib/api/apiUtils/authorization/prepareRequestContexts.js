import { policies } from 'arsenal';
const RequestContext = policies.RequestContext;


/**
 * Prepares the requestContexts array to send to Vault for authorization
 * @param {string} apiMethod - api being called
 * @param {object} request - request object
 * @param {string} sourceBucket - name of sourceBucket if copy request
 * @param {string} sourceObject - name of sourceObject if copy request
 * @return {RequestContext []} array of requestContexts
 */
export default function prepareRequestContexts(apiMethod, request, sourceBucket,
    sourceObject) {
    // if multiObjectDelete request, we want to authenticate
    // before parsing the post body and creating multiple requestContexts
    // so send null as requestContexts to Vault to avoid authorization
    // checks at this point
    //
    // If bucketPut request, we want to authenticate in the API itself because
    // we only have access to the locationConstraint at that point.
    if (apiMethod === 'multiObjectDelete' || apiMethod === 'bucketPut') {
        return null;
    }
    const requestContexts = [];
    if (apiMethod === 'objectCopy' || apiMethod === 'objectPutCopyPart') {
        const getRequestContext = new RequestContext(request.headers,
            request.query, sourceBucket, sourceObject,
            request.socket.remoteAddress, request.connection.encrypted,
            'objectGet', 's3');
        const putRequestContext = new RequestContext(request.headers,
            request.query, request.bucketName, request.objectKey,
            request.socket.remoteAddress, request.connection.encrypted,
            'objectPut', 's3');
        requestContexts.push(getRequestContext, putRequestContext);
    } else {
        const requestContext = new RequestContext(request.headers,
            request.query, request.bucketName, request.objectKey,
            request.socket.remoteAddress, request.connection.encrypted,
            apiMethod, 's3');
        requestContexts.push(requestContext);
    }
    return requestContexts;
}
