package org.example.springboot_demo.service;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
public final class Checks {
 private Checks() {}
 public static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
 public static String text(String value,String field,int max,boolean required) {
  if (value!=null && value.codePoints().anyMatch(code ->
    (code<32 && code!=9 && code!=10 && code!=13) || (code>=127 && code<=159)
     || (code>=0x202a && code<=0x202e) || (code>=0x2066 && code<=0x2069)
     || (code>=0xd800 && code<=0xdfff)))
   throw bad(field+"包含不允许的控制字符。");
  String result = value == null ? "" : value.trim();
  if ((required && result.isEmpty()) || result.length() > max) throw bad(field + "格式或长度不正确。");
  return result;
 }
 public static String email(String value) {
  String email = text(value,"邮箱",254,true).toLowerCase(Locale.ROOT);
  if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw bad("请输入有效的邮箱。");
  return email;
 }
 public static String password(String value) {
  if (value == null || value.length() < 8 || value.length() > 128) throw bad("密码长度须为 8 至 128 位。");
  return value;
 }
 public static String confirmed(String password,String confirm) {
  password(password);
  if (!password.equals(confirm)) throw bad("两次输入的密码不一致。");
  return password;
 }
}
