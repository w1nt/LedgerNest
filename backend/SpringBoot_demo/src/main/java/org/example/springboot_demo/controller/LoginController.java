package org.example.springboot_demo.controller;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpServletResponse;
import org.example.springboot_demo.dto.Requests;
import org.example.springboot_demo.dto.UserResponse;
import org.example.springboot_demo.service.AccountService;
import org.example.springboot_demo.service.SessionCookies;
import org.example.springboot_demo.security.AuthSessions;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
@RestController
@RequestMapping({"","/api"})
public class LoginController {
 private final AccountService accounts;
 private final SessionCookies sessionCookies;
 private final AuthSessions sessions;
 public LoginController(AccountService accounts, SessionCookies sessionCookies, AuthSessions sessions) {
  this.accounts=accounts; this.sessionCookies=sessionCookies; this.sessions=sessions;
 }
 public static long userId(HttpServletRequest request) {
  if (!(request.getAttribute(AuthSessions.REQUEST_USER) instanceof Long id))
   throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录。");
  return id;
 }
 @PostMapping(value="/register",consumes="application/json") @ResponseStatus(HttpStatus.CREATED)
 public UserResponse register(@RequestBody Requests.Register input) { return accounts.register(input); }
 @PostMapping(value="/login",consumes="application/json")
 public UserResponse login(@RequestBody Requests.Login input,HttpServletRequest request) {
  var authentication=accounts.login(input);
  sessions.establish(request,authentication.user().id(),authentication.credentialVersion());
  return authentication.user();
 }
 @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void logout(HttpServletRequest request, HttpServletResponse response) {
  sessionCookies.clear(request, response);
 }
 @GetMapping("/me")
 public UserResponse me(HttpServletRequest request) { return accounts.me(userId(request)); }
 @PatchMapping(value="/me",consumes="application/json")
 public UserResponse profile(@RequestBody Requests.Profile input,HttpServletRequest request) { return accounts.updateProfile(userId(request),input); }
 @PutMapping(value="/me/password",consumes="application/json") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void password(@RequestBody Requests.Password input,HttpServletRequest request, HttpServletResponse response) {
  accounts.changePassword(userId(request),input); sessionCookies.clear(request, response);
 }
 @GetMapping("/me/preferences")
 public Map<String,String> preferences(HttpServletRequest request) { return Map.of("theme",accounts.theme(userId(request))); }
 @PutMapping(value="/me/preferences",consumes="application/json")
 public Map<String,String> preferences(@RequestBody Requests.Preferences input,HttpServletRequest request) {
  return Map.of("theme",accounts.updateTheme(userId(request),input.theme()));
 }
}
