import assert from 'assert';
import http from 'http';
import url from 'url';

import withV4 from '../support/withV4';
import BucketUtility from '../../lib/utility/bucket-util';

const bucket = 'foo-bucket';
const key = 'foo-key';
const body = Buffer.alloc(1024 * 1024);

class ContinueRequestHandler {
    constructor(path) {
        this.path = path;
        return this;
    }

    setRequestPath(path) {
        this.path = path;
        return this;
    }

    setExpectHeader(header) {
        this.expectHeader = header;
        return this;
    }

    getRequestOptions() {
        return {
            path: this.path,
            hostname: 'localhost',
            port: 8000,
            method: 'PUT',
            headers: {
                'content-length': body.length,
                'Expect': this.expectHeader || '100-continue',
            },
        };
    }

    hasStatusCode(statusCode, cb) {
        const options = this.getRequestOptions();
        const req = http.request(options, res => {
            assert.strictEqual(res.statusCode, statusCode);
            return cb();
        });
        // Send the body since the continue event has been emitted.
        req.on('continue', () => req.end(body));
    }

    sendsBodyOnContinue(cb) {
        const options = this.getRequestOptions();
        const req = http.request(options);
        // At this point we have only sent the header.
        assert(req.output.length === 1);
        const headerLen = req.output[0].length;
        req.on('continue', () => {
            // Has only the header been sent?
            assert.strictEqual(req.socket.bytesWritten, headerLen);
            // Send the body since the continue event has been emitted.
            return req.end(body);
        });
        req.on('close', () => {
            const expected = body.length + headerLen;
            // Has the entire body been sent?
            assert.strictEqual(req.socket.bytesWritten, expected);
            return cb();
        });
        req.on('error', err => cb(err));
    }
}

describe('PUT public object with 100-continue header', () => {
    withV4(sigCfg => {
        let bucketUtil;
        let s3;
        let ContinueRequest;
        const invalidSignedURL = `/${bucket}/${key}`;

        beforeEach(() => {
            bucketUtil = new BucketUtility('default', sigCfg);
            s3 = bucketUtil.s3;
            const params = {
                Bucket: bucket,
                Key: key,
            };
            const signedUrl = s3.getSignedUrl('putObject', params);
            const { path } = url.parse(signedUrl);
            ContinueRequest = new ContinueRequestHandler(path);
            return s3.createBucketAsync({ Bucket: bucket });
        });

        afterEach(() =>
            bucketUtil.empty(bucket)
            .then(() => bucketUtil.deleteOne(bucket)));

        it('should return 200 status code', done =>
            ContinueRequest.hasStatusCode(200, done));

        it('should return 200 status code with upper case value', done =>
            ContinueRequest.setExpectHeader('100-CONTINUE')
                .hasStatusCode(200, done));

        it('should return 403 status code if cannot authenticate', done =>
            ContinueRequest.setRequestPath(invalidSignedURL)
                .hasStatusCode(403, done));

        // TODO: Do not skip this test when upgraded to post Node v5.5
        it.skip('should return 417 status code if incorrect value', done =>
            ContinueRequest.setExpectHeader('101-continue')
                .hasStatusCode(417, done));

        it('should wait for continue event before sending body', done =>
            ContinueRequest.sendsBodyOnContinue(done));

        it('should continue if a public user', done =>
            ContinueRequest.setRequestPath(invalidSignedURL)
                .sendsBodyOnContinue(done));
    });
});
