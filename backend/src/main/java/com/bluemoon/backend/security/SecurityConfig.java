package com.bluemoon.backend.security;
import com.bluemoon.backend.api.ApiException;
import com.bluemoon.backend.exception.ApiErrors;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.List;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
@Configuration
public class SecurityConfig {
    @Bean org.springframework.security.core.userdetails.UserDetailsService noDefaultUsers() {
        return username -> {throw new org.springframework.security.core.userdetails.UsernameNotFoundException("Bearer authentication required");};
    }
    @Bean SecurityFilterChain security(HttpSecurity http,IdentityService identities,ApiErrors errors) throws Exception {
        var bearer=new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
                errors.requestId(req,res);
                if(req.getMethod().equals("OPTIONS") || List.of("/api/auth/login","/api/auth/register","/api/health","/api/hello").contains(req.getServletPath())) {chain.doFilter(req,res);return;}
                try {
                    var actor=identities.authenticate(req.getHeader("Authorization")); req.setAttribute("actor",actor);
                    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor,null,List.of()));
                } catch(ApiException e) {errors.write(req,res,e);return;}
                catch(org.springframework.dao.DataAccessException e) {errors.write(req,res,new ApiException(503,"DEPENDENCY_UNAVAILABLE","Dịch vụ xác thực chưa sẵn sàng."));return;}
                chain.doFilter(req,res);
            }
        };
        return http.cors(c->{}).csrf(c->c.disable())
            .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a->a.requestMatchers("/api/hello","/api/health","/api/auth/login","/api/auth/register","/error").permitAll().anyRequest().authenticated())
            .addFilterBefore(bearer,UsernamePasswordAuthenticationFilter.class)
            .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->errors.write(req,res,new ApiException(401,"AUTHENTICATION_FAILED","Cần xác thực."))))
            .build();
    }
}
