package org.example.springboot_demo.dto;
/** Never expose passwords or password hashes. */
public record UserResponse(long id, String username, String email, String address) {}
