import { errors } from 'arsenal';
import { parseString } from 'xml2js';
import { waterfall } from 'async';
import { createBucket } from './apiUtils/bucket/bucketCreation';
import collectCorsHeaders from '../utilities/collectCorsHeaders';
import config from '../Config';
import aclUtils from '../utilities/aclUtils';
import { pushMetric } from '../utapi/utilities';

/*
   Format of xml request:

   <?xml version="1.0" encoding="UTF-8"?>
   <CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
   <LocationConstraint>us-west-1</LocationConstraint>
   </CreateBucketConfiguration>
   */

function _parseXML(request, log, cb) {
    if (request.post) {
        return parseString(request.post, (err, result) => {
            if (err || !result.CreateBucketConfiguration
                || !result.CreateBucketConfiguration.LocationConstraint
                || !result.CreateBucketConfiguration.LocationConstraint[0]) {
                log.debug('request xml is malformed');
                return cb(errors.MalformedXML);
            }
            const locationConstraint = result.CreateBucketConfiguration
                .LocationConstraint[0];
            log.trace('location constraint',
                { locationConstraint });
            return cb(null, locationConstraint);
        });
    }
    // We need `locationConstraint` to be `null` in this case.
    return cb(null, null);
}

/**
 * PUT Service - Create bucket for the user
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with requester's info
 * @param {object} request - http request object
 * @param {object} log - Werelogs logger
 * @param {function} callback - callback to server
 * @return {undefined}
 */
export default function bucketPut(authInfo, request, log, callback) {
    log.debug('processing request', { method: 'bucketPut' });

    if (authInfo.isRequesterPublicUser()) {
        log.debug('operation not available for public user');
        return callback(errors.AccessDenied);
    }
    if (!aclUtils.checkGrantHeaderValidity(request.headers)) {
        log.trace('invalid acl header');
        return callback(errors.InvalidArgument);
    }
    const bucketName = request.bucketName;

    return waterfall([
        next => _parseXML(request, log, next),
        (locationConstraint, next) => createBucket(authInfo, bucketName,
            request.headers, locationConstraint, config.usEastBehavior, log,
            (err, previousBucket) => {
                // if bucket already existed, gather any relevant cors headers
                const corsHeaders = collectCorsHeaders(
                    request.headers.origin, request.method, previousBucket);
                if (err) {
                    return next(err, corsHeaders);
                }
                pushMetric('createBucket', log, {
                    authInfo,
                    bucket: bucketName,
                });
                return next(null, corsHeaders);
            }),
    ], (err, corsHeaders) => callback(err, corsHeaders));
}
