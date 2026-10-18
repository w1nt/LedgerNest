package org.example.springboot_demo.model;

/** Safe internal profile; converting to the public response remains a service responsibility. */
public record UserProfile(long id, String username, String email, String address) {}
