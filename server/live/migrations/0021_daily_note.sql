-- デイリーの提出の一言 (要望 5ceb28ff、オーナー 11-13「提出時に一言コメント欄つければおけ」)。任意・40 字まで・無い人は NULL
ALTER TABLE daily_tries ADD COLUMN note TEXT;
