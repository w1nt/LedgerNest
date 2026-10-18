package org.example.springboot_demo.controller;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.example.springboot_demo.security.RateLimited;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
@RestControllerAdvice
public class ApiErrors {
 private static final Logger log=LoggerFactory.getLogger(ApiErrors.class);
 private ResponseEntity<Map<String,Object>> error(int status,String message) {
  return ResponseEntity.status(status).body(Map.of("status",status,"message",message));
 }
 @ExceptionHandler(ResponseStatusException.class)
 public ResponseEntity<Map<String,Object>> status(ResponseStatusException ex) {
  return error(ex.getStatusCode().value(),ex.getReason()==null?"请求失败。":ex.getReason());
 }
 @ExceptionHandler(RateLimited.class)
 public ResponseEntity<Map<String,Object>> rateLimited(RateLimited ex) {
  return ResponseEntity.status(429).header("Retry-After",Long.toString(ex.retryAfter()))
   .body(Map.of("status",429,"message","请求过于频繁，请稍后重试。"));
 }
 @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
 public ResponseEntity<Map<String,Object>> method(Exception ex) { return error(405,"请求方法不受支持。"); }
 @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
 public ResponseEntity<Map<String,Object>> media(Exception ex) { return error(415,"请使用 application/json 请求格式。"); }
 @ExceptionHandler(NoResourceFoundException.class)
 public ResponseEntity<Map<String,Object>> missing(Exception ex) { return error(404,"接口不存在。"); }
 @ExceptionHandler(DuplicateKeyException.class)
 public ResponseEntity<Map<String,Object>> duplicate(DuplicateKeyException ex) { return error(409,"邮箱已被注册。"); }
 @ExceptionHandler({HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,Object>> input(Exception ex) { return error(400,"请求字段格式不正确。"); }
 @ExceptionHandler(DataAccessException.class)
 public ResponseEntity<Map<String,Object>> database(DataAccessException ex) {
  log.error("Database operation failed [{}]",ex.getClass().getSimpleName()); return error(503,"数据库暂时不可用，请稍后重试。");
 }
 @ExceptionHandler(Exception.class)
 public ResponseEntity<Map<String,Object>> unexpected(Exception ex,HttpServletRequest request) {
  log.error("Unhandled API error [{}] [{}]",request.getAttribute("requestId"),ex.getClass().getSimpleName());
  return error(500,"服务暂时不可用，请稍后重试。");
 }
}
