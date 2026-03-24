package dev.montell.keycloak.sender;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

public final class HmacSigner {

    private HmacSigner() {}

    /**
     * Returns a lowercase hex-encoded HMAC of {@code payload}.
     *
     * @param payload   the message to sign (UTF-8)
     * @param secret    the HMAC secret (UTF-8)
     * @param algorithm JCA algorithm name, e.g. {@code "HmacSHA256"}, {@code "HmacSHA1"}
     * @throws IllegalArgumentException if the algorithm is unsupported
     */
    public static String sign(String payload, String secret, String algorithm) {
        try {
            Mac mac = Mac.getInstance(algorithm);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), algorithm));
            byte[] bytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (java.security.NoSuchAlgorithmException | java.security.InvalidKeyException e) {
            throw new IllegalArgumentException("HMAC signing failed for algorithm: " + algorithm, e);
        }
    }
}
