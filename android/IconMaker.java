import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public class IconMaker {
  public static void main(String[] args) throws Exception {
    File source = new File(args[0]);
    File res = new File(args[1]);
    BufferedImage input = ImageIO.read(source);
    if (input == null || input.getWidth() != input.getHeight() || input.getWidth() < 128 || input.getWidth() > 1024) throw new IllegalArgumentException("Invalid square PNG");
    String[] density = {"mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"};
    int[] sizes = {48, 72, 96, 144, 192};
    for (int i = 0; i < sizes.length; i++) {
      File dir = new File(res, "mipmap-" + density[i]);
      for (String file : new String[]{"ic_launcher.png", "ic_launcher_round.png"}) draw(input, sizes[i], 0, new File(dir, file));
      // Adaptive icon content stays within its safe middle area.
      draw(input, sizes[i] * 2, sizes[i] / 2, new File(dir, "ic_launcher_foreground.png"));
    }
  }
  static void draw(BufferedImage input, int size, int inset, File target) throws Exception {
    BufferedImage output = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
    Graphics2D g = output.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    g.drawImage(input, inset, inset, size - inset, size - inset, 0, 0, input.getWidth(), input.getHeight(), null);
    g.dispose();
    if (!ImageIO.write(output, "png", target)) throw new IllegalStateException("PNG encoder unavailable");
  }
}
