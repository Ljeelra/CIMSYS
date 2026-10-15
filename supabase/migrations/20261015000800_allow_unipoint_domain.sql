-- 가입 허용 이메일 도메인에 unipoint.co.kr 추가
update public.app_settings
   set value = 'ablearn.kr,unipoint.co.kr', updated_at = now()
 where key = 'allowed_email_domains';
