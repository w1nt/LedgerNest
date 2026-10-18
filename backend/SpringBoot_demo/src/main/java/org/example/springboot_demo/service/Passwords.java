package org.example.springboot_demo.service;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;
import org.example.springboot_demo.security.RequestLimits;
@Component
public class Passwords {
 private static final int ITERATIONS = 600_000;
 private final SecureRandom random = new SecureRandom();
 private final String dummyHash;
 private final RequestLimits limits;
 public Passwords(RequestLimits limits) { this.limits=limits; dummyHash = hash("dummy-password-for-login-timing"); }
 public String hash(String password) {
  byte[] salt = new byte[16]; random.nextBytes(salt);
  return "pbkdf2$" + ITERATIONS + "$" + Base64.getEncoder().encodeToString(salt)
   + "$" + Base64.getEncoder().encodeToString(derive(password,salt,ITERATIONS));
 }
 public boolean matches(String password, String encoded) {
  if (encoded == null) { matches(password,dummyHash); return false; }
  try {
   String[] fields = encoded.split("\\$");
   if (fields.length != 4 || !fields[0].equals("pbkdf2")) return false;
   int rounds = Integer.parseInt(fields[1]);
   if (rounds < 100_000 || rounds > 2_000_000) return false;
   return MessageDigest.isEqual(Base64.getDecoder().decode(fields[3]),
    derive(password,Base64.getDecoder().decode(fields[2]),rounds));
  } catch (IllegalArgumentException ex) { return false; }
 }
 private byte[] derive(String password, byte[] salt, int rounds) {
  limits.acquireHashing();
  PBEKeySpec spec = new PBEKeySpec(password.toCharArray(),salt,rounds,256);
  try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
  catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException("Password hashing unavailable",ex); }
  finally { spec.clearPassword(); limits.releaseHashing(); }
 }
}
