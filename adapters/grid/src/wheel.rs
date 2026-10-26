//! Integration-only Ctrl+wheel policy. Native GridCraft input stays unchanged.
#[derive(Default)]
pub struct WheelZoom {
    place: Option<(u64, usize)>,
    remainder: f32,
    last_time: f64,
}
impl WheelZoom {
    pub fn turn(&mut self, place: (u64, usize), now: f64, notches: f32, zoom: u16) -> u16 {
        if !notches.is_finite() || !now.is_finite() {
            return zoom;
        }
        if self.place != Some(place) || now - self.last_time > 0.75 || now < self.last_time {
            self.remainder = 0.0;
        }
        self.place = Some(place);
        self.last_time = now;
        self.remainder = (self.remainder + notches).clamp(-32.0, 32.0);
        let mut next = zoom.clamp(10, 400);
        while self.remainder >= 0.6 {
            next = next.saturating_add(5).min(400);
            self.remainder -= 1.0;
        }
        while self.remainder <= -0.6 {
            next = next.saturating_sub(5).max(10);
            self.remainder += 1.0;
        }
        next
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notches_are_fine_and_reversible_at_high_zoom_too() {
        for start in [100, 200, 350] {
            let mut wheel = WheelZoom::default();
            let next = wheel.turn((1, 0), 1.0, 1.0, start);
            assert_eq!(next, start + 5);
            assert_eq!(wheel.turn((1, 0), 1.1, -1.0, next), start);
        }
    }
    #[test]
    fn fractional_events_accumulate_and_expire_between_places() {
        let mut wheel = WheelZoom::default();
        assert_eq!(wheel.turn((1, 0), 1.0, 0.25, 100), 100);
        assert_eq!(wheel.turn((1, 0), 1.1, 0.25, 100), 100);
        assert_eq!(wheel.turn((1, 0), 1.2, 0.25, 100), 105);
        assert_eq!(wheel.turn((1, 0), 1.3, 0.25, 105), 105);
        assert_eq!(wheel.turn((1, 0), 1.4, -1.0, 105), 100);
        assert_eq!(wheel.turn((1, 0), 1.5, 0.5, 100), 100);
        assert_eq!(wheel.turn((1, 1), 1.6, 0.5, 100), 100);
        assert_eq!(wheel.turn((2, 1), 1.7, 0.5, 100), 100);
        assert_eq!(wheel.turn((2, 1), 3.0, 0.5, 100), 100);
    }
    #[test]
    fn clamps_and_ignores_invalid_input() {
        let mut wheel = WheelZoom::default();
        assert_eq!(wheel.turn((1, 0), 1.0, 32.0, 399), 400);
        assert_eq!(wheel.turn((1, 0), 1.1, -32.0, 11), 10);
        assert_eq!(wheel.turn((1, 0), 1.2, f32::NAN, 100), 100);
    }
}
