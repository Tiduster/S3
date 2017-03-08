import { errors } from 'arsenal';
import { parseString } from 'xml2js';
import routesUtils from '../../../routes/routesUtils';

export function checkBucketVersioning(request, response, log, cb) {
    if (request.post === '') {
        log.debug('request xml is missing');
        return routesUtils.responseNoBody(errors.MalformedXML, null, response,
            null, log);
    }
    return parseString(request.post, (err, result) => {
        if (err) {
            log.debug('request xml is malformed');
            return routesUtils.responseNoBody(errors.MalformedXML, null,
                response, null, log);
        }
        const status = result.VersioningConfiguration.Status ?
            result.VersioningConfiguration.Status[0] : undefined;
        const mfaDelete = result.VersioningConfiguration.MfaDelete ?
            result.VersioningConfiguration.MfaDelete[0] : undefined;
        const validStatuses = ['Enabled', 'Suspended'];
        const validMfaDeletes = [undefined, 'Enabled', 'Disabled'];
        if (validStatuses.indexOf(status) < 0 ||
            validMfaDeletes.indexOf(mfaDelete) < 0) {
            log.debug('illegal versioning configuration');
            return routesUtils.responseNoBody(
                errors.IllegalVersioningConfigurationException,
                null, response, null, log);
        }
        if (mfaDelete) {
            log.debug('mfa deletion is not implemented');
            return routesUtils.responseNoBody(errors.NotImplemented
                .customizedDescription('MFA Deletion is not supported yet.'),
                    null, response, null, log);
        }
        return cb();
    });
}

export function checkBucketPut(request, response, log, cb) {
    if (request.post) {
        return parseString(request.post, (err, result) => {
            if (err || !result.CreateBucketConfiguration
                || !result.CreateBucketConfiguration.LocationConstraint
                || !result.CreateBucketConfiguration.LocationConstraint[0]) {
                log.debug('request xml is malformed');
                return routesUtils.responseNoBody(errors.MalformedXML, null,
                    response, null, log);
            }
            const locationConstraint = result.CreateBucketConfiguration
                .LocationConstraint[0];
            log.trace('location constraint',
                { locationConstraint });
            return cb(locationConstraint);
        });
    }
    return cb();
}
